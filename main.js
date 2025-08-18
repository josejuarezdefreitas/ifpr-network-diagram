// ===================================================================================
// ARQUIVO: main.js (Versão Melhorada com Autenticação)
// ===================================================================================

// --- IMPORTAÇÕES DO FIREBASE ---
import { initializeApp } from "https://www.gstatic.com/firebasejs/9.15.0/firebase-app.js";
import { getDatabase, ref, set, onValue } from "https://www.gstatic.com/firebasejs/9.15.0/firebase-database.js";
// NOVAS IMPORTAÇÕES PARA AUTENTICAÇÃO
import { getAuth, onAuthStateChanged, signInWithEmailAndPassword, signOut } from "https://www.gstatic.com/firebasejs/9.15.0/firebase-auth.js";


// ===================================================================================
//           ATENÇÃO: COLE AQUI O SEU NOVO OBJETO `firebaseConfig`
//         Obtido do seu NOVO projeto Firebase na Etapa 2 de configuração.
// ===================================================================================
const firebaseConfig = {
  apiKey: "AIzaSyB86gSMm-DhX0J6iZaskJ9slGIrrlgSoAQ",
  authDomain: "ifpr-network-diagram.firebaseapp.com",
  projectId: "ifpr-network-diagram",
  storageBucket: "ifpr-network-diagram.firebasestorage.app",
  messagingSenderId: "60399535580",
  appId: "1:60399535580:web:d2a64c5fd1a527b747bb19",
  measurementId: "G-6Q55PQTFFF"
};

// --- INICIALIZAÇÃO DO FIREBASE ---
const app = initializeApp(firebaseConfig);
const database = getDatabase(app);
const auth = getAuth(app); // Novo: serviço de autenticação
const diagramStateRef = ref(database, 'diagramState');

// --- VARIÁVEIS GLOBAIS E ELEMENTOS DO DOM ---

// Elementos de Autenticação
const authOverlay = document.getElementById('auth-overlay');
const loginForm = document.getElementById('login-form');
const loginError = document.getElementById('login-error');
const mainContent = document.getElementById('main-content');
const userStatus = document.getElementById('user-status');
const userEmailEl = document.getElementById('user-email');
const logoutBtn = document.getElementById('btn-logout');

// Elementos do Diagrama
const diagram = document.getElementById('networkDiagram');
const canvas = document.getElementById('canvas');
const connectionsSvg = document.getElementById('connections-svg');
const svgNS = "http://www.w3.org/2000/svg";

const editModal = document.getElementById('edit-modal');
const editForm = document.getElementById('edit-form');
const customFieldsContainer = document.getElementById('modal-custom-fields');

let devices = [];
let connections = [];
let selectedDeviceIds = [];
let connectionStartId = null;
let scale = 1.0, panX = 0, panY = 0;
let isPanning = false, isSpacebarDown = false;
let currentlyEditingDeviceId = null;
let isAppInitialized = false; // Flag para evitar inicialização múltipla

const deviceIcons = {
    router: '📡', switch: '🔀', server: '🖥️', firewall: '🔥',
    endpoint: '💻', opnsense: '🛡️', printer: '🖨️', printer3d: '🧊',
    nvr: '📹', camera: '📷', tv: '📺'
};


// ===================================================================================
// --- SEÇÃO DE AUTENTICAÇÃO ---
// ===================================================================================

/** Observa o estado de autenticação do usuário */
onAuthStateChanged(auth, user => {
    if (user) {
        // Usuário está logado
        authOverlay.style.display = 'none'; // Esconde o login
        mainContent.style.display = 'block'; // Mostra o conteúdo principal
        userEmailEl.textContent = user.email;
        userStatus.style.display = 'block';

        // Inicializa a aplicação do diagrama APENAS SE AINDA NÃO FOI INICIALIZADA
        if (!isAppInitialized) {
            initializeApp();
        }
    } else {
        // Usuário está deslogado
        authOverlay.style.display = 'flex'; // Mostra o login
        mainContent.style.display = 'none'; // Esconde o conteúdo principal
        userStatus.style.display = 'none';
        isAppInitialized = false; // Permite reiniciar ao logar novamente
        // Limpa dados locais para garantir que não haja "lixo" na tela de login
        if(canvas) canvas.innerHTML = '<svg id="connections-svg"></svg>'; // Limpa canvas
    }
});

/** Lida com a submissão do formulário de login */
loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = document.getElementById('login-email').value;
    const password = document.getElementById('login-password').value;
    loginError.textContent = '';

    try {
        await signInWithEmailAndPassword(auth, email, password);
        // O `onAuthStateChanged` cuidará do resto
    } catch (error) {
        console.error("Erro no login:", error.message);
        loginError.textContent = "E-mail ou senha inválidos.";
    }
});

/** Lida com o logout */
logoutBtn.addEventListener('click', async () => {
    try {
        await signOut(auth);
        // O `onAuthStateChanged` cuidará do resto
    } catch (error) {
        console.error("Erro no logout:", error);
    }
});


// ===================================================================================
// --- LÓGICA PRINCIPAL DO DIAGRAMA ---
// ===================================================================================

/** Função de inicialização principal da aplicação */
function initializeApp() {
    console.log("Inicializando aplicação do diagrama...");
    loadState();
    applyViewTransform();
    setupEventListeners();
    isAppInitialized = true;
}

/** Configura todos os event listeners da aplicação uma única vez */
function setupEventListeners() {
    // Evita adicionar listeners duplicados
    if (diagram.dataset.listenersAttached === 'true') return;

    // Controles do Diagrama
    diagram.addEventListener('mousedown', handleDiagramMouseDown);
    diagram.addEventListener('wheel', e => {
        e.preventDefault();
        const rect = diagram.getBoundingClientRect();
        zoom(-e.deltaY * 0.001, e.clientX - rect.left, e.clientY - rect.top);
    });

    // Teclas do Teclado
    document.addEventListener('keydown', (e) => {
        const activeEl = document.activeElement.tagName;
        if (e.code === 'Space' && !isSpacebarDown && activeEl !== 'INPUT') {
            isSpacebarDown = true;
            if (!isPanning) diagram.classList.add('panning');
        }
        if ((e.key === 'Delete' || e.key === 'Backspace') && activeEl !== 'INPUT') {
            deleteSelectedDevices();
        }
        if (e.key === 'Escape') {
            selectedDeviceIds = [];
            cancelConnectionMode();
            closeEditModal();
        }
    });
    document.addEventListener('keyup', (e) => {
        if (e.code === 'Space') {
            isSpacebarDown = false;
            if (!isPanning) diagram.classList.remove('panning');
        }
    });

    // Botões do Painel, Zoom e Modal
    document.getElementById('zoom-in').addEventListener('click', () => zoom(0.15, diagram.clientWidth / 2, diagram.clientHeight / 2));
    document.getElementById('zoom-out').addEventListener('click', () => zoom(-0.15, diagram.clientWidth / 2, diagram.clientHeight / 2));
    document.getElementById('zoom-reset').addEventListener('click', resetView);
    document.getElementById('zoom-fit').addEventListener('click', fitView);

    // Botões do Painel de Controle
    document.getElementById('btn-clear').addEventListener('click', () => {
        if (confirm('Limpar todo o diagrama? Esta ação não pode ser desfeita e afetará todos os usuários.')) {
            devices = [];
            connections = [];
            selectedDeviceIds = [];
            saveState();
        }
    });

    // ... (resto dos seus event listeners de import/export, add device, etc.)
    // Seu código original aqui está ótimo e não precisa de grandes mudanças.
    // Apenas garantimos que ele só seja ativado após o login.

    document.getElementById('btn-export').addEventListener('click', () => {
        const stateJson = JSON.stringify({ devices, connections }, null, 2);
        const blob = new Blob([stateJson], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `layout-rede-ifpr-${Date.now()}.json`;
        a.click();
        URL.revokeObjectURL(url);
    });

    const importFileEl = document.getElementById('import-file');
    document.getElementById('btn-import').addEventListener('click', () => importFileEl.click());
    importFileEl.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (event) => {
            try {
                const importedState = JSON.parse(event.target.result);
                if (Array.isArray(importedState.devices) && Array.isArray(importedState.connections)) {
                    devices = importedState.devices;
                    connections = importedState.connections;
                    selectedDeviceIds = [];
                    saveState();
                    fitView();
                } else {
                    alert('Erro: Arquivo JSON inválido ou mal formatado.');
                }
            } catch (error) {
                alert('Erro ao ler o arquivo: ' + error.message);
            }
        };
        reader.readAsText(file);
        importFileEl.value = '';
    });

    // Adicionar Dispositivos
    document.getElementById('add-router').addEventListener('click', () => addDevice('router'));
    document.getElementById('add-switch').addEventListener('click', () => addDevice('switch'));
    document.getElementById('add-server').addEventListener('click', () => addDevice('server'));
    document.getElementById('add-firewall').addEventListener('click', () => addDevice('firewall'));
    document.getElementById('add-endpoint').addEventListener('click', () => addDevice('endpoint'));
    document.getElementById('add-printer').addEventListener('click', () => addDevice('printer'));
    document.getElementById('add-printer3d').addEventListener('click', () => addDevice('printer3d'));
    document.getElementById('add-nvr').addEventListener('click', () => addDevice('nvr'));
    document.getElementById('add-camera').addEventListener('click', () => addDevice('camera'));
    document.getElementById('add-tv').addEventListener('click', () => addDevice('tv'));
    document.getElementById('add-custom').addEventListener('click', addCustomDevice);

    // Eventos do Modal
    editForm.addEventListener('submit', handleFormSubmit);
    document.getElementById('modal-cancel').addEventListener('click', closeEditModal);
    editModal.addEventListener('click', (e) => {
        if (e.target === editModal) { // Fecha se clicar fora do conteúdo
            closeEditModal();
        }
    });

    diagram.dataset.listenersAttached = 'true';
}


// --- LÓGICA DE DADOS (FIREBASE) ---

function saveState() {
    // A regra de segurança do Firebase garante que isso só funcione se o usuário estiver logado.
    set(diagramStateRef, {
        devices: devices || [],
        connections: connections || []
    }).catch(error => {
        console.error("Erro ao salvar o estado:", error);
        alert("Sua sessão pode ter expirado. Por favor, recarregue a página.");
    });
}

function loadState() {
    onValue(diagramStateRef, (snapshot) => {
        const state = snapshot.val();
        if (state && state.devices) {
            devices = state.devices;
            connections = state.connections || [];
        } else {
            // Estado inicial se o banco estiver vazio
            devices = [{ id: 'opnsense-main', type: 'opnsense', x: 2000, y: 1500, name: 'OPNsense', ip: '---', info: 'Firewall', photoUrl: '', websiteUrl: 'https://opnsense.org/', isCustom: false }];
            connections = [];
            saveState(); // Salva o estado inicial
        }
        render();
        fitView();
    }, (error) => {
        console.error("Erro ao carregar dados do Firebase:", error);
        alert("Não foi possível conectar ao banco de dados. Verifique a configuração do Firebase e as regras de segurança.");
    });
}

// ===================================================================================
// O RESTANTE DO SEU CÓDIGO (render, createDeviceElement, addDevice, etc.)
// PODE SER COLADO AQUI SEM NENHUMA ALTERAÇÃO. ELE JÁ É BEM ESTRUTURADO.
// Colei ele abaixo para que o arquivo fique completo.
// ===================================================================================

/** Renderiza todos os dispositivos e conexões no canvas */
function render() {
    if (!canvas || !connectionsSvg) return;

    // Limpa dispositivos antigos
    const existingDevices = canvas.querySelectorAll('.network-device');
    existingDevices.forEach(el => el.remove());

    // Desenha cada dispositivo
    (devices || []).forEach(device => {
        const deviceEl = createDeviceElement(device);
        addDeviceEvents(deviceEl);
        canvas.appendChild(deviceEl);
    });

    updateAllConnections();
    updateSelectionVisuals();
}

/** Cria o elemento HTML para um único dispositivo */
function createDeviceElement(device) {
    const deviceEl = document.createElement('div');
    const typeClass = device.isCustom ? `custom-${device.type.toLowerCase().replace(/\s+/g, '-')}` : device.type;
    deviceEl.className = `network-device ${typeClass}`;
    deviceEl.id = device.id;
    deviceEl.style.left = `${device.x}px`;
    deviceEl.style.top = `${device.y}px`;

    if (device.isCustom && device.customColor) {
        deviceEl.style.borderColor = device.customColor;
    }

    const icon = device.isCustom ? device.customIcon : (deviceIcons[device.type] || '❓');
    const photoHtml = device.photoUrl ? `<img src="${device.photoUrl}" class="device-photo" alt="${device.name}" onerror="this.style.display='none'; this.nextElementSibling.style.display='block';"><div class="device-icon" style="display:none;">${icon}</div>` : `<div class="device-icon">${icon}</div>`;
    const websiteLinkHtml = device.websiteUrl ? `<a href="${device.websiteUrl}" target="_blank" class="device-website-link" onclick="event.stopPropagation()">🔗</a>` : '';

    deviceEl.innerHTML = `${websiteLinkHtml}${photoHtml}<div class="device-name">${device.name}</div><div class="device-ip">${device.ip}</div><div class="device-info">${device.info}</div>`;

    if (device.isCustom && device.customColor) {
        deviceEl.querySelector('.device-name').style.color = device.customColor;
    }
    return deviceEl;
}

/** Adiciona um novo dispositivo ao diagrama */
function addDevice(type, isCustom = false, customProps = {}) {
    const diagramRect = diagram.getBoundingClientRect();
    const centerXInView = (diagramRect.width / 2) - panX;
    const centerYInView = (diagramRect.height / 2) - panY;

    const newDevice = {
        id: `${type.toLowerCase().replace(/\s+/g, '-')}-${Date.now()}`,
        type: type,
        x: (centerXInView / scale) - 80,
        y: (centerYInView / scale) - 60,
        name: type.charAt(0).toUpperCase() + type.slice(1),
        ip: '192.168.1.1',
        info: 'Novo dispositivo',
        photoUrl: '',
        websiteUrl: '',
        isCustom: isCustom,
        ...customProps
    };

    if (!devices) devices = [];
    devices.push(newDevice);
    saveState();
}

function addCustomDevice() {
    const typeName = prompt("Qual o nome do novo tipo de equipamento?", "Access Point");
    if (!typeName) return;
    const icon = prompt("Insira um ícone para este tipo (ex: 📶, ✨):", "✨");
    if (!icon) return;
    const color = prompt("Insira uma cor para a borda (hex):", "#00bcd4");
    if (!color) return;

    addDevice(typeName, true, { customIcon: icon, customColor: color });
}

// --- LÓGICA DO MODAL DE EDIÇÃO ---

function openEditModal(deviceId) {
    const device = devices.find(d => d.id === deviceId);
    if (!device) return;

    currentlyEditingDeviceId = deviceId;

    document.getElementById('modal-title').textContent = `Editar ${device.name}`;
    document.getElementById('modal-name').value = device.name;
    document.getElementById('modal-ip').value = device.ip;
    document.getElementById('modal-info').value = device.info;
    document.getElementById('modal-photo').value = device.photoUrl || '';
    document.getElementById('modal-website').value = device.websiteUrl || '';

    if (device.isCustom) {
        customFieldsContainer.style.display = 'block';
        document.getElementById('modal-custom-icon').value = device.customIcon || '';
        document.getElementById('modal-custom-color').value = device.customColor || '#000000';
    } else {
        customFieldsContainer.style.display = 'none';
    }

    editModal.style.display = 'flex';
}

function closeEditModal() {
    currentlyEditingDeviceId = null;
    editModal.style.display = 'none';
}

function handleFormSubmit(e) {
    e.preventDefault();
    if (!currentlyEditingDeviceId) return;

    const device = devices.find(d => d.id === currentlyEditingDeviceId);
    if (!device) return;

    device.name = document.getElementById('modal-name').value;
    device.ip = document.getElementById('modal-ip').value;
    device.info = document.getElementById('modal-info').value;
    device.photoUrl = document.getElementById('modal-photo').value.trim();
    device.websiteUrl = document.getElementById('modal-website').value.trim();

    if (device.isCustom) {
        device.customIcon = document.getElementById('modal-custom-icon').value;
        device.customColor = document.getElementById('modal-custom-color').value;
    }

    closeEditModal();
    saveState();
}


// --- CONTROLES DE VISUALIZAÇÃO E INTERAÇÃO ---

function applyViewTransform() {
    if (canvas) {
        canvas.style.transform = `translate(${panX}px, ${panY}px) scale(${scale})`;
    }
    if (document.getElementById('zoom-level')) {
        document.getElementById('zoom-level').textContent = `${Math.round(scale * 100)}%`;
    }
}

function zoom(delta, mouseX, mouseY) {
    const oldScale = scale;
    scale = Math.max(0.2, Math.min(2, scale * (1 + delta)));
    if (oldScale === scale) return;
    panX = mouseX - (mouseX - panX) * (scale / oldScale);
    panY = mouseY - (mouseY - panY) * (scale / oldScale);
    applyViewTransform();
}

function resetView() {
    scale = 1.0;
    panX = 0;
    panY = 0;
    applyViewTransform();
}

function fitView() {
    if (!diagram || !devices || devices.length === 0) {
        resetView();
        return;
    }
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    devices.forEach(d => {
        minX = Math.min(minX, d.x);
        minY = Math.min(minY, d.y);
        maxX = Math.max(maxX, d.x + 160); // device width approx
        maxY = Math.max(maxY, d.y + 120); // device height approx
    });
    const contentWidth = maxX - minX;
    const contentHeight = maxY - minY;
    if (contentWidth <= 0 || contentHeight <= 0) {
        resetView();
        return;
    }
    const viewWidth = diagram.clientWidth;
    const viewHeight = diagram.clientHeight;
    scale = Math.min(viewWidth / contentWidth, viewHeight / contentHeight) * 0.9;
    panX = (viewWidth - (contentWidth * scale)) / 2 - (minX * scale);
    panY = (viewHeight - (contentHeight * scale)) / 2 - (minY * scale);
    applyViewTransform();
}

function updateSelectionVisuals() {
    canvas.querySelectorAll('.network-device').forEach(el => {
        el.classList.toggle('selected', selectedDeviceIds.includes(el.id));
        el.classList.toggle('connection-start', connectionStartId === el.id);
    });
}

function deleteSelectedDevices() {
    if (selectedDeviceIds.length === 0) return;
    devices = devices.filter(d => !selectedDeviceIds.includes(d.id));
    connections = connections.filter(c => !selectedDeviceIds.includes(c.from) && !selectedDeviceIds.includes(c.to));
    selectedDeviceIds = [];
    saveState();
}

function startConnection(id) {
    connectionStartId = id;
    diagram.classList.add('connecting');
    updateSelectionVisuals();
}

function finishConnection(endId) {
    if (connectionStartId && connectionStartId !== endId) {
        const exists = connections.some(c => (c.from === connectionStartId && c.to === endId) || (c.from === endId && c.to === connectionStartId));
        if (!exists) {
            if (!connections) connections = [];
            connections.push({ from: connectionStartId, to: endId });
            saveState();
        }
    }
    cancelConnectionMode();
}

function cancelConnectionMode() {
    connectionStartId = null;
    if (diagram) diagram.classList.remove('connecting');
    updateSelectionVisuals();
}

function updateConnectionsForDevice(deviceId) {
    const deviceEl = document.getElementById(deviceId);
    if (!deviceEl) return;

    const center = {
        x: deviceEl.offsetLeft + deviceEl.offsetWidth / 2,
        y: deviceEl.offsetTop + deviceEl.offsetHeight / 2
    };

    connectionsSvg.querySelectorAll(`[data-from='${deviceId}'], [data-to='${deviceId}']`).forEach(line => {
        if (line.dataset.from === deviceId) {
            line.setAttribute('x1', center.x);
            line.setAttribute('y1', center.y);
        }
        if (line.dataset.to === deviceId) {
            line.setAttribute('x2', center.x);
            line.setAttribute('y2', center.y);
        }
    });
}

function updateAllConnections() {
    const svg = document.getElementById('connections-svg');
    if (!svg) return;
    svg.innerHTML = '';
    (connections || []).forEach(conn => {
        const fromEl = document.getElementById(conn.from);
        const toEl = document.getElementById(conn.to);
        if (fromEl && toEl) {
            const getCenter = el => ({ x: el.offsetLeft + el.offsetWidth / 2, y: el.offsetTop + el.offsetHeight / 2 });
            const start = getCenter(fromEl);
            const end = getCenter(toEl);
            const line = document.createElementNS(svgNS, 'line');
            line.setAttribute('x1', start.x);
            line.setAttribute('y1', start.y);
            line.setAttribute('x2', end.x);
            line.setAttribute('y2', end.y);
            line.setAttribute('class', 'connection-line');
            line.dataset.from = conn.from;
            line.dataset.to = conn.to;
            svg.appendChild(line);
        }
    });
}


// --- EVENT HANDLERS ---

function addDeviceEvents(deviceEl) {
    deviceEl.addEventListener('mousedown', handleDeviceMouseDown);
    deviceEl.addEventListener('dblclick', (e) => {
        e.stopPropagation();
        openEditModal(e.currentTarget.id);
    });
}

function handleDiagramMouseDown(e) {
    if (isSpacebarDown || e.button === 1) { // Pan com Espaço ou botão do meio
        isPanning = true;
        diagram.classList.add('panning');
        let lastX = e.clientX, lastY = e.clientY;

        function onPanMove(moveEvent) {
            panX += moveEvent.clientX - lastX;
            panY += moveEvent.clientY - lastY;
            lastX = moveEvent.clientX;
            lastY = moveEvent.clientY;
            applyViewTransform();
        }
        function onPanEnd() {
            isPanning = false;
            diagram.classList.remove('panning');
            document.removeEventListener('mousemove', onPanMove);
            document.removeEventListener('mouseup', onPanEnd);
        }
        document.addEventListener('mousemove', onPanMove);
        document.addEventListener('mouseup', onPanEnd);

    } else if (e.target === canvas || e.target === diagram) {
        selectedDeviceIds = [];
        cancelConnectionMode();
        updateSelectionVisuals();
    }
}

function handleDeviceMouseDown(e) {
    e.stopPropagation();
    if (e.button !== 0) return; // Apenas botão esquerdo

    const deviceId = e.currentTarget.id;

    if (e.shiftKey) { // Modo de conexão
        connectionStartId ? finishConnection(deviceId) : startConnection(deviceId);
        return;
    }

    cancelConnectionMode();

    if (e.ctrlKey || e.metaKey) { // Seleção múltipla
        selectedDeviceIds.includes(deviceId)
            ? selectedDeviceIds = selectedDeviceIds.filter(id => id !== deviceId)
            : selectedDeviceIds.push(deviceId);
    } else if (!selectedDeviceIds.includes(deviceId)) {
        selectedDeviceIds = [deviceId];
    }
    updateSelectionVisuals();

    // Lógica de Arrastar (Otimizada)
    let dragOffsets = new Map();
    selectedDeviceIds.forEach(id => {
        const dev = devices.find(d => d.id === id);
        dragOffsets.set(id, { x: dev.x, y: dev.y });
    });

    const dragStartX = e.clientX;
    const dragStartY = e.clientY;

    function onDeviceDrag(dragEvent) {
        const deltaX = (dragEvent.clientX - dragStartX) / scale;
        const deltaY = (dragEvent.clientY - dragStartY) / scale;

        selectedDeviceIds.forEach(id => {
            const device = devices.find(d => d.id === id);
            const deviceEl = document.getElementById(id);
            const offset = dragOffsets.get(id);

            device.x = offset.x + deltaX;
            device.y = offset.y + deltaY;
            
            deviceEl.style.left = `${device.x}px`;
            deviceEl.style.top = `${device.y}px`;
            
            updateConnectionsForDevice(id);
        });
    }

    function onDeviceDragEnd() {
        document.removeEventListener('mousemove', onDeviceDrag);
        document.removeEventListener('mouseup', onDeviceDragEnd);
        saveState(); // Salva no Firebase apenas no final do arraste
    }
    document.addEventListener('mousemove', onDeviceDrag);
    document.addEventListener('mouseup', onDeviceDragEnd);
}