const socket = io('http://192.168.1.6:8000');
const videoGrid = document.getElementById('videoGrid');
const peers = {};
const localVideo = document.createElement('video');
const muteAudioButton = document.getElementById('muteAudio');
const muteVideoButton = document.getElementById('muteVideo');
const chatInput = document.getElementById('chatInput');
const sendMessageButton = document.getElementById('sendMessage');
const messagesContainer = document.getElementById('messages');

sendMessageButton.addEventListener('click', sendMessage);
chatInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
        sendMessage();
    }
});

function sendMessage() {
    const message = chatInput.value.trim();
    if (message) {
        addMessageToChat(`You: ${message}`, 'self');
        socket.emit('chat-message', message);
        chatInput.value = '';
    }
}

function addMessageToChat(message, sender = 'other') {
    const messageElement = document.createElement('div');
    messageElement.classList.add('message');
    if (sender === 'self') messageElement.style.color = '#78ff78';
    messageElement.textContent = message;
    messagesContainer.appendChild(messageElement);
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
}

socket.on('chat-message', (message, senderId) => {
    addMessageToChat(`${senderId.substring(0, 3)}...: ${message}`);
});


muteAudioButton.addEventListener('click', () => {
    const audioTrack = localStream.getAudioTracks()[0];
    if (audioTrack) {
        audioTrack.enabled = !audioTrack.enabled;
        muteAudioButton.style.backgroundColor = audioTrack.enabled ? '' : 'rgba(224, 0, 0, 0.751)';
        muteAudioButton.textContent = audioTrack.enabled ? 'Mute Audio' : 'Unmute Audio';
        socket.emit('mute-state', { audio: !audioTrack.enabled, video: undefined });
    }
});

muteVideoButton.addEventListener('click', () => {
    const videoTrack = localStream.getVideoTracks()[0];
    if (videoTrack) {
        videoTrack.enabled = !videoTrack.enabled;
        muteVideoButton.textContent = videoTrack.enabled ? 'Mute Video' : 'Unmute Video';
        muteVideoButton.style.backgroundColor = videoTrack.enabled ? '' : 'rgba(224, 0, 0, 0.751)';
        socket.emit('mute-state', { audio: undefined, video: !videoTrack.enabled });
    }
});


let localStream = null;
let audioAnalyzers = {};

localVideo.muted = true;
localVideo.classList.add('video');
videoGrid.appendChild(localVideo);

function analyzeAudio(stream, videoElement) {
    const audioContext = new (window.AudioContext || window.webkitAudioContext)();
    const analyser = audioContext.createAnalyser();
    const source = audioContext.createMediaStreamSource(stream);

    source.connect(analyser);
    analyser.fftSize = 256;

    const dataArray = new Uint8Array(analyser.frequencyBinCount);

    function checkAudioLevel() {
        analyser.getByteFrequencyData(dataArray);
        const volume = dataArray.reduce((acc, val) => acc + val, 0) / dataArray.length;

        if (volume > 20) {
            videoElement.classList.add('speaking');
        } else {
            videoElement.classList.remove('speaking');
        }

        requestAnimationFrame(checkAudioLevel);
    }

    checkAudioLevel();
    return audioContext;
}

async function getLocalStream() {
    try {
        localStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
        localVideo.srcObject = localStream;
        localVideo.play();

        audioAnalyzers[socket.id] = analyzeAudio(localStream, localVideo);

        socket.emit('join-call');
    } catch (error) {
        console.error('error media devices:', error);
    }
}

function createPeerConnection(peerSocketId) {
    const peerConnection = new RTCPeerConnection({
        iceServers: [
            { urls: 'stun:stun.l.google.com:19302' },
            {
                urls: "turn:188.213.199.201:3478",
               username: "amiroxEsmeMan",
               credential: "salamEsmeManAmire",
           },
        ],
    });

    localStream.getTracks().forEach(track => {
        peerConnection.addTrack(track, localStream);
    });

    peerConnection.onicecandidate = event => {
        if (event.candidate) {
            socket.emit('ice-candidate', event.candidate, peerSocketId);
        }
    };

    const remoteStream = new MediaStream();
    peerConnection.ontrack = event => {
        remoteStream.addTrack(event.track);

        if (!peers[peerSocketId]?.remoteVideo) {
            const remoteVideo = document.createElement('video');
            remoteVideo.srcObject = remoteStream;
            remoteVideo.autoplay = true;
            remoteVideo.classList.add('video');
            videoGrid.appendChild(remoteVideo);
            peers[peerSocketId].remoteVideo = remoteVideo;

            audioAnalyzers[peerSocketId] = analyzeAudio(remoteStream, remoteVideo);
        }
    };

    return peerConnection;
}

socket.on('user-connected', peerSocketId => {
    const peerConnection = createPeerConnection(peerSocketId);
    peers[peerSocketId] = { peerConnection };

    peerConnection.createOffer()
        .then(offer => {
            peerConnection.setLocalDescription(offer);
            socket.emit('offer', offer, peerSocketId);
        });
});

socket.on('offer', async (offer, peerSocketId) => {
    const peerConnection = createPeerConnection(peerSocketId);
    peers[peerSocketId] = { peerConnection };

    await peerConnection.setRemoteDescription(new RTCSessionDescription(offer));
    const answer = await peerConnection.createAnswer();
    await peerConnection.setLocalDescription(answer);

    socket.emit('answer', answer, peerSocketId);
});

socket.on('answer', async (answer, peerSocketId) => {
    await peers[peerSocketId].peerConnection.setRemoteDescription(new RTCSessionDescription(answer));
});

socket.on('ice-candidate', async (candidate, peerSocketId) => {
    const peerConnection = peers[peerSocketId]?.peerConnection;
    if (peerConnection) {
        await peerConnection.addIceCandidate(new RTCIceCandidate(candidate));
    }
});

socket.on('user-disconnected', peerSocketId => {
    if (peers[peerSocketId]?.remoteVideo) {
        videoGrid.removeChild(peers[peerSocketId].remoteVideo);
    }
    if (peers[peerSocketId]?.peerConnection) {
        peers[peerSocketId].peerConnection.close();
    }
    if (audioAnalyzers[peerSocketId]) {
        audioAnalyzers[peerSocketId].close();
        delete audioAnalyzers[peerSocketId];
    }
    delete peers[peerSocketId];
});

socket.on('mute-state', ({ peerId, audio, video }) => {
    const peerVideo = peers[peerId]?.remoteVideo;
    if (peerVideo) {
        if (audio !== undefined) {
            peerVideo.dataset.audioMuted = audio ? 'true' : 'false';
        }
        if (video !== undefined) {
            peerVideo.style.opacity = video ? '0.5' : '1'; 
            }
    }
});

getLocalStream();