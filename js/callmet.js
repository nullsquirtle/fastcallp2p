
let screenStream = null;
let isScreenSharing = false;
let autoCallAttempted = false;
let autoAnswerEnabled = false;

const peerIdInput = document.getElementById('peerId');
const localNameInput = document.getElementById('localName');
const localNameDisplay = document.getElementById('localNameDisplay');
const remotePeerIdInput = document.getElementById('remotePeerId');
const callBtn = document.getElementById('callBtn');
const endCallBtn = document.getElementById('endCallBtn');
const toggleAudioBtn = document.getElementById('toggleAudioBtn');
const toggleVideoBtn = document.getElementById('toggleVideoBtn');
const toggleScreenShareBtn = document.getElementById('toggleScreenShareBtn');
const localVideo = document.getElementById('localVideo');
const remoteVideo = document.getElementById('remoteVideo');
const connectionStatus = document.getElementById('connectionStatus');
const statusText = document.getElementById('statusText');
const callStatusInfo = document.getElementById('callStatusInfo');
const callStatusText = document.getElementById('callStatusText');
const incomingCallAlert = document.getElementById('incomingCallAlert');
const callerInfo = document.getElementById('callerInfo');
const answerCallBtn = document.getElementById('answerCallBtn');
const declineCallBtn = document.getElementById('declineCallBtn');
const chatWindow = document.getElementById('chatWindow');
const chatMessages = document.getElementById('chatMessages');
const chatInput = document.getElementById('chatInput');
const sendMessageBtn = document.getElementById('sendMessageBtn');
const fileUpload = document.getElementById('fileUpload');

let peer = null;
let localStream = null;
let remoteStream = null;
let currentCall = null;
let isAudioEnabled = true;
let isVideoEnabled = true;
let incomingCall = null;
let dataConnection = null;
let chatOpen = false;

function checkUrlParams() {
    const params = new URLSearchParams(window.location.search);
    const runAuto = params.get('run') === 'auto';
    
    if (params.get('id') && runAuto) {
        autoCallAttempted = true;
        console.log('Автоматический звонок настроен для ID:', params.get('id'));
    }
    
    if (params.get('setid') && runAuto) {
        autoAnswerEnabled = true;
        console.log('Автоматический ответ на звонки включен');
    }
}

function tryAutoCall() {
    if (!autoCallAttempted || !peer || peer.disconnected) return;
    
    const params = new URLSearchParams(window.location.search);
    const remoteId = params.get('id');
    
    if (remoteId && localStream && callBtn && !callBtn.classList.contains('hidden')) {
        setTimeout(() => {
            if (peer && peer.open) {
                makeCall(remoteId);
            }
        }, 1000);
    }
}


async function toggleScreenShare() {
    if (isScreenSharing) {
        if (screenStream) {
            screenStream.getTracks().forEach(track => track.stop());
            screenStream = null;
        }
        
        if (localStream) {
            const videoTrack = localStream.getVideoTracks()[0];
            if (currentCall) {
                const sender = currentCall.peerConnection.getSenders()
                    .find(s => s.track && s.track.kind === 'video');
                if (sender && videoTrack) {
                    sender.replaceTrack(videoTrack);
                }
            }
            localVideo.srcObject = localStream;
        }
        
        isScreenSharing = false;
        toggleScreenShareBtn.innerHTML = '<i class="fas fa-desktop"></i>';
        toggleScreenShareBtn.style.backgroundColor = '';
        console.log('Демонстрация экрана остановлена');
        
    } else {
        try {
            screenStream = await navigator.mediaDevices.getDisplayMedia({
                video: {
                    cursor: "always",
                    displaySurface: "monitor"
                },
                audio: false
            });
            
            if (currentCall) {
                const sender = currentCall.peerConnection.getSenders()
                    .find(s => s.track && s.track.kind === 'video');
                if (sender) {
                    sender.replaceTrack(screenStream.getVideoTracks()[0]);
                }
            }
            
            const newStream = new MediaStream([
                localStream.getAudioTracks()[0], 
                screenStream.getVideoTracks()[0] 
            ]);
            
            localVideo.srcObject = newStream;
            isScreenSharing = true;
            toggleScreenShareBtn.innerHTML = '<i class="fas fa-stop-circle"></i>';
            toggleScreenShareBtn.style.backgroundColor = '#e74c3c';
            screenStream.getVideoTracks()[0].onended = () => {
                toggleScreenShare();
            };
            
        } catch (error) {
            //console.error('Ошибка при демонстрации экрана:', error);
            //alert('Не удалось начать демонстрацию экрана: ' + error.message);
        }
    }
}

function tryAutoAnswer(call) {
    if (!autoAnswerEnabled) return false;
    
    console.log('Пытаюсь автоматически ответить на звонок от:', call.peer);
    setTimeout(() => {
        if (incomingCall && localStream) {
            console.log('Автоматически отвечаю на звонок');
            answerCall();
        }
    }, 500);
    
    return true;
}

function sendMessage() {
    const message = chatInput.value.trim();
    if (!message || !dataConnection || !dataConnection.open) {
        return;
    }
    
    const messageData = {
        type: 'message',
        text: message,
        sender: localNameInput.value || 'Аноним',
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    };
    
    try {
        dataConnection.send(messageData);
        displayMessage(messageData, true);
        chatInput.value = '';
    } catch (err) {
        console.error('Ошибка отправки сообщения:', err);
    }
}

function handleChatKeyPress(event) {
    if (event.key === 'Enter') {
        sendMessage();
    }
}

function displayMessage(data, isLocal) {
    const messageDiv = document.createElement('div');
    messageDiv.className = `message ${isLocal ? 'local' : 'remote'}`;
    
    const timeSpan = document.createElement('span');
    timeSpan.className = 'message-time';
    timeSpan.textContent = data.timestamp;
    
    const senderSpan = document.createElement('span');
    senderSpan.className = 'message-sender';
    senderSpan.textContent = data.sender + ': ';
    
    const textSpan = document.createElement('span');
    textSpan.className = 'message-text';
    textSpan.textContent = data.text;
    
    messageDiv.appendChild(timeSpan);
    messageDiv.appendChild(senderSpan);
    messageDiv.appendChild(textSpan);
    
    chatMessages.appendChild(messageDiv);
    chatMessages.scrollTop = chatMessages.scrollHeight;
}

fileUpload.addEventListener('change', handleFileUpload);

function handleFileUpload(event) {
    const file = event.target.files[0];
    if (!file || !dataConnection || !dataConnection.open) {
        return;
    }
    
    if (file.size > 10 * 1024 * 1024) {
        alert('Файл слишком большой. Максимальный размер: 10MB');
        return;
    }
    
    const reader = new FileReader();
    reader.onload = function(e) {
        const fileData = {
            type: 'file',
            fileName: file.name,
            fileType: file.type,
            fileSize: formatFileSize(file.size),
            data: e.target.result,
            sender: localNameInput.value || 'Аноним',
            timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        };
        
        try {
            dataConnection.send(fileData);
            displayFile(fileData, true);
        } catch (err) {
            console.error('Ошибка отправки файла:', err);
        }
    };
    
    reader.readAsDataURL(file);
    fileUpload.value = '';
}

function formatFileSize(bytes) {
    if (bytes < 1024) return bytes + ' bytes';
    else if (bytes < 1048576) return (bytes / 1024).toFixed(1) + ' KB';
    else return (bytes / 1048576).toFixed(1) + ' MB';
}

function displayFile(data, isLocal) {
    const fileDiv = document.createElement('div');
    fileDiv.className = `message file-message ${isLocal ? 'local' : 'remote'}`;
    
    const timeSpan = document.createElement('span');
    timeSpan.className = 'message-time';
    timeSpan.textContent = data.timestamp;
    
    const senderSpan = document.createElement('span');
    senderSpan.className = 'message-sender';
    senderSpan.textContent = data.sender + ' отправил(а) файл: ';
    
    const fileInfo = document.createElement('div');
    fileInfo.className = 'file-info';
    
    const fileName = document.createElement('span');
    fileName.className = 'file-name';
    fileName.textContent = data.fileName;
    
    const fileSize = document.createElement('span');
    fileSize.className = 'file-size';
    fileSize.textContent = ' (' + data.fileSize + ')';
    
    const downloadBtn = document.createElement('button');
    downloadBtn.className = 'download-btn';
    downloadBtn.innerHTML = '<i class="fas fa-download"></i> Скачать';
    downloadBtn.onclick = function() {
        downloadFile(data.data, data.fileName);
    };
    
    fileInfo.appendChild(fileName);
    fileInfo.appendChild(fileSize);
    
    fileDiv.appendChild(timeSpan);
    fileDiv.appendChild(senderSpan);
    fileDiv.appendChild(fileInfo);
    fileDiv.appendChild(downloadBtn);
    
    chatMessages.appendChild(fileDiv);
    chatMessages.scrollTop = chatMessages.scrollHeight;
}

function downloadFile(dataUrl, fileName) {
    const link = document.createElement('a');
    link.href = dataUrl;
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
}

function toggleChat() {
    if (currentCall || dataConnection) {
        chatWindow.classList.toggle('hidden');
        chatOpen = !chatWindow.classList.contains('hidden');
        if (chatOpen) {
            chatInput.focus();
        }
    } else {
        alert('Сначала установите соединение!');
    }
}

document.querySelector('.menu-container').innerHTML = `
    <button onclick="toggleChat()" class="menuButt"><i class="fas fa-comments"></i> Чат</button>
    <button onclick="chatSettingOpen()" class="menuButt"><i class="fas fa-copy"></i> Ссылка</button>
`;

function setupDataConnection(conn) {
    conn.on('open', function() {
        console.log('Data connection установлен');
        updateCallStatus('Соединение установлено');
        
        conn.send({
            type: 'info',
            name: localNameInput.value || 'Аноним'
        });
    });
    
    conn.on('data', function(data) {
        console.log('Получены данные:', data);
        
        if (data.type === 'message') {
            displayMessage(data, false);
        } else if (data.type === 'file') {
            displayFile(data, false);
        } else if (data.type === 'info') {
            console.log('Собеседник: ' + data.name);
        }
    });
    
    conn.on('close', function() {
        console.log('Data connection закрыт');
        dataConnection = null;
    });
    
    conn.on('error', function(err) {
        console.error('Ошибка data connection:', err);
    });
}

document.addEventListener('DOMContentLoaded', function() {
    checkUrlParams();
    
    let savedPeerId = localStorage.getItem('peerId');
    if (!savedPeerId) {
        savedPeerId = 'user_' + Math.random().toString(36).substr(2, 9);
        localStorage.setItem('peerId', savedPeerId);
    }
    
    const savedName = localStorage.getItem('userName');
    if (savedName) {
        localNameInput.value = savedName;
        localNameDisplay.textContent = '(' + savedName + ')';
    }
    
    const params = new URLSearchParams(window.location.search);
    if (params.get('setid')) {
        savedPeerId = params.get('setid');
        localStorage.setItem('peerId', savedPeerId);
        console.log('ID установлен из URL:', savedPeerId);
    }
    
    peer = new Peer(savedPeerId, {
        host: 'wavos.ru',
        path: '/w1avoser',
        port: 3000,
        secure: true,
        key: 'peerjs',
        config: {
            'iceServers': [
                { urls: 'stun:5.129.249.204:3478' },
                {
                    urls: [
                        'turn:5.129.249.204:3478?transport=udp',
                        'turn:5.129.249.204:3478?transport=tcp'
                    ],
                    username: 'wavos',
                    credential: 'server'
                }
            ]
        },
        debug: 2
    });
    
    peerIdInput.value = savedPeerId;
    
    peer.on('open', function(id) {
        console.log('Подключено к серверу', id);
        updateConnectionStatus('connected', 'Подключено к серверу');
        peerIdInput.value = "https://wavos.ru/call?id=" + id;
        
        if (id !== savedPeerId) {
            localStorage.setItem('peerId', id);
        }
        if (autoCallAttempted) {
            setTimeout(() => {
                tryAutoCall();
            }, 1000);
        }
    });
    
    peer.on('connection', function(conn) {
        console.log('Входящее data соединение от:', conn.peer);
        dataConnection = conn;
        setupDataConnection(dataConnection);
    });
    
    peer.on('call', function(call) {
        console.log('Входящий звонок от:', call.peer);
        incomingCall = call;
        if (tryAutoAnswer(call)) {
            return;
        }
        callerInfo.textContent = 'Входящий звонок от ID: ' + call.peer;
        incomingCallAlert.classList.remove('hidden');
        
        setTimeout(function() {
            if (incomingCallAlert.classList.contains('hidden')) return;
            incomingCallAlert.classList.add('hidden');
            if (incomingCall) {
                incomingCall.close();
                incomingCall = null;
            }
        }, 60000);
    });
    
    peer.on('error', function(err) {
        console.error('Ошибка PeerJS:', err);
        
        if (err.type === 'unavailable-id') {
            const newId = 'user_' + Math.random().toString(36).substr(2, 9);
            localStorage.setItem('peerId', newId);
            location.reload();
        } else if (err.type === 'peer-unavailable') {
            updateCallStatus('Собеседник недоступен');
        } else {
            updateConnectionStatus('disconnected', 'Ошибка подключения: ' + err.message);
        }
    });
    
    peer.on('disconnected', function() {
        console.log('Отключено от сервера PeerJS');
        updateConnectionStatus('disconnected', 'Отключено от сервера');
        
        setTimeout(function() {
            if (peer && !peer.disconnected) {
                peer.reconnect();
            }
        }, 5000);
    });
    
    peer.on('close', function() {
        console.log('Соединение закрыто');
        updateConnectionStatus('disconnected', 'Соединение закрыто');
    });
    
    initMediaDevices();
    setupEventListeners();
});

async function initMediaDevices() {
    try {
        localStream = await navigator.mediaDevices.getUserMedia({
            video: true,
            audio: true
        });
        
        localVideo.srcObject = localStream;
        console.log('Медиаустройства инициализированы');
        if (autoCallAttempted) {
            setTimeout(() => {
                tryAutoCall();
            }, 500);
        }
    } catch (error) {
        console.error('Ошибка доступа к медиаустройствам:', error);
        updateCallStatus('Не удалось получить доступ к камере/микрофону');
    }
}

function setupEventListeners() {
    localNameInput.addEventListener('input', function() {
        localStorage.setItem('userName', localNameInput.value);
        localNameDisplay.textContent = '(' + localNameInput.value + ')';
    });
    
    callBtn.addEventListener('click', function() {
        const remoteId = remotePeerIdInput.value.trim();
        if (!remoteId) return;
        
        if (!localStream) {
            alert('Не удалось получить доступ к камере/микрофону');
            return;
        }
        
        makeCall(remoteId);
    });
    
    endCallBtn.addEventListener('click', endCall);
    
    toggleAudioBtn.addEventListener('click', toggleAudio);
    toggleVideoBtn.addEventListener('click', toggleVideo);
    toggleScreenShareBtn.addEventListener('click', toggleScreenShare);
    
    answerCallBtn.addEventListener('click', answerCall);
    declineCallBtn.addEventListener('click', declineCall);
    
    remotePeerIdInput.addEventListener('keypress', function(e) {
        if (e.key === 'Enter') {
            callBtn.click();
        }
    });
    
    sendMessageBtn.addEventListener('click', sendMessage);
    chatInput.addEventListener('keypress', handleChatKeyPress);
}

function makeCall(remoteId) {
    if (!localStream) {
        updateCallStatus('Ошибка: нет доступа к медиаустройствам');
        return;
    }
    
    if (!peer) {
        updateCallStatus('Ошибка: Peer не инициализирован');
        return;
    }
    
    updateCallStatus('Установка соединения...');
    dataConnection = peer.connect(remoteId);
    if (dataConnection) {
        setupDataConnection(dataConnection);
    }
    
    currentCall = peer.call(remoteId, localStream);
    
    if (!currentCall) {
        updateCallStatus('Ошибка при совершении звонка');
        return;
    }
    
    setupCallEvents(currentCall);
}

function answerCall() {
    if (!incomingCall || !localStream) return;
    
    incomingCallAlert.classList.add('hidden');
    updateCallStatus('Ответ на звонок...');
    
    dataConnection = peer.connect(incomingCall.peer);
    if (dataConnection) {
        setupDataConnection(dataConnection);
    }
    
    incomingCall.answer(localStream);
    currentCall = incomingCall;
    setupCallEvents(currentCall);
    
    incomingCall = null;
}

function declineCall() {
    if (incomingCall) {
        incomingCall.close();
        incomingCall = null;
    }
    incomingCallAlert.classList.add('hidden');
    updateCallStatus('Звонок отклонен');
}

function setupCallEvents(call) {
    call.on('stream', function(stream) {
        console.log('Получен удаленный поток');
        remoteStream = stream;
        remoteVideo.srcObject = stream;
        updateCallStatus('Звонок активен');
        updateCallUI(true);
    });
    
    call.on('close', function() {
        console.log('Звонок завершен');
        endCall();
    });
    
    call.on('error', function(err) {
        console.error('Ошибка звонка:', err);
        updateCallStatus('Ошибка звонка: ' + err.message);
        endCall();
    });
}

function endCall() {
    if (isScreenSharing) {
        toggleScreenShare();
    }
    
    if (currentCall) {
        currentCall.close();
        currentCall = null;
    }
    
    if (dataConnection) {
        dataConnection.close();
        dataConnection = null;
    }
    
    if (remoteVideo.srcObject) {
        remoteVideo.srcObject.getTracks().forEach(track => track.stop());
        remoteVideo.srcObject = null;
    }
    
    updateCallStatus('Звонок завершен');
    updateCallUI(false);
    incomingCallAlert.classList.add('hidden');
    chatWindow.classList.add('hidden');
    chatMessages.innerHTML = '';
}

function toggleAudio() {
    if (!localStream) return;
    
    const audioTracks = localStream.getAudioTracks();
    if (audioTracks.length > 0) {
        isAudioEnabled = !audioTracks[0].enabled;
        audioTracks[0].enabled = isAudioEnabled;
        
        toggleAudioBtn.innerHTML = isAudioEnabled ? 
            '<i class="fas fa-microphone"></i>' : 
            '<i class="fas fa-microphone-slash"></i>';
        toggleAudioBtn.style.backgroundColor = isAudioEnabled ? '' : '#e74c3c';
        
        console.log('Микрофон ' + (isAudioEnabled ? 'включен' : 'выключен'));
    }
}

function toggleVideo() {
    if (!localStream) return;
    
    const videoTracks = localStream.getVideoTracks();
    if (videoTracks.length > 0) {
        isVideoEnabled = !videoTracks[0].enabled;
        videoTracks[0].enabled = isVideoEnabled;
        
        toggleVideoBtn.innerHTML = isVideoEnabled ? 
            '<i class="fas fa-video"></i>' : 
            '<i class="fas fa-video-slash"></i>';
        toggleVideoBtn.style.backgroundColor = isVideoEnabled ? '' : '#e74c3c';
        
        console.log('Камера ' + (isVideoEnabled ? 'включена' : 'выключена'));
    }
}

function updateCallUI(isCallActive) {
    if (isCallActive) {
        callBtn.classList.add('hidden');
        endCallBtn.classList.remove('hidden');
        remotePeerIdInput.disabled = true;
        if (!chatOpen) {
            chatWindow.classList.remove('hidden');
            chatOpen = true;
        }
    } else {
        callBtn.classList.remove('hidden');
        endCallBtn.classList.add('hidden');
        remotePeerIdInput.disabled = false;
    }
}

function updateCallStatus(status) {
    callStatusText.textContent = status;
}

function updateConnectionStatus(status, text) {
    statusText.textContent = text;
    
    connectionStatus.className = 'connection-status';
    
    if (status === 'connected') {
        connectionStatus.classList.add('status-connected');
        statusText.innerHTML = '<span class="status-indicator connected"></span> ' + text;
    } else if (status === 'disconnected') {
        connectionStatus.classList.add('status-disconnected');
        statusText.innerHTML = '<span class="status-indicator disconnected"></span> ' + text;
    } else if (status === 'error') {
        connectionStatus.classList.add('status-disconnected');
        statusText.innerHTML = '<span class="status-indicator disconnected"></span> ' + text;
    } else {
        connectionStatus.classList.add('status-connecting');
        statusText.innerHTML = '<span class="status-indicator connecting"></span> ' + text;
    }
}

function chatSettingOpen() {
    var textpeerId = document.getElementById('peerId').value;
    navigator.clipboard.writeText(textpeerId);
}

function chatMainOpen() {
    document.getElementById("chatSetting").style.display = "none";
    document.getElementById("chatMain").style.display = "none";
}

function funcCopyLink() {
    var textpeerId = document.getElementById('peerId').value;
    navigator.clipboard.writeText(textpeerId);
}
