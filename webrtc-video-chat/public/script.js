// Menangani koneksi socket
const socket = io();
let localStream;
let peerConnections = {};
let pairingCode = '';
let isVideoOn = true;
let isMicOn = true;
let userName = '';  // Variabel untuk menyimpan nama pengguna

const config = {
    iceServers: [{ urls: 'stun:stun.l.google.com:19302' }]
};

const localVideo = document.getElementById("localVideo");
const remoteVideos = document.getElementById("remoteVideos");
const codeInput = document.getElementById("codeInput");
const joinBtn = document.getElementById("joinBtn");
const leaveBtn = document.getElementById("leaveBtn");
const statusSpan = document.getElementById("status");
const chatSend = document.getElementById('chatSend');
const chatInput = document.getElementById('chatInput');
const participantsCount = document.getElementById('participants');
const chatMessages = document.getElementById('chatMessages');
const toggleVideoBtn = document.getElementById('toggleVideo');
const toggleMicBtn = document.getElementById('toggleMic');
const notifSound = document.getElementById('notifSound');

// Menangani status UI
function setStatus(msg) {
    statusSpan.textContent = msg;
    console.log("[STATUS]", msg);
}

// Fungsi untuk membuat elemen video untuk remote user
function createVideoElement(id, userName = 'User') {
    const videoContainer = document.createElement('div');
    videoContainer.className = 'relative w-40 h-28 bg-black rounded-xl overflow-hidden';
  
    const video = document.createElement('video');
    video.id = `remote-${id}`;
    video.autoplay = true;
    video.playsInline = true;
    video.className = 'w-full h-full object-cover';
  
    const nameTag = document.createElement('div');
    nameTag.className = 'absolute top-4 left-4 bg-gray-900 text-white text-sm font-semibold py-1 px-3 rounded-full';
    nameTag.textContent = userName;
  
    videoContainer.appendChild(video);
    videoContainer.appendChild(nameTag);
  
    document.getElementById('remoteVideos').appendChild(videoContainer);
    return video;
  }
  

// Fungsi untuk menampilkan popup nama pengguna
function showUserNamePopup() {
    return Swal.fire({
        title: 'Masukkan Nama Pengguna',
        input: 'text',
        inputPlaceholder: 'Masukkan nama Anda...',
        showCancelButton: false,
        confirmButtonText: 'Ok',
        allowOutsideClick: false,
        allowEscapeKey: false
    }).then(result => {
        if (result.isConfirmed && result.value) {
            userName = result.value.trim();  // Menyimpan nama pengguna
            return true;
        }
        return false;
    });
}

// Fungsi untuk mengakses kamera dan audio untuk pratinjau
async function accessCameraPreview() {
    setStatus("Mengakses kamera...");
    localStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
    localVideo.srcObject = localStream;

    // Enable tombol video dan mic setelah mendapatkan akses
    toggleVideoBtn.disabled = false;
    toggleMicBtn.disabled = false;
}

// Fungsi untuk bergabung ke room
joinBtn.onclick = async () => {
    // Tampilkan popup nama sebelum bergabung
    const isNameEntered = await showUserNamePopup();
    if (!isNameEntered) return;  // Jika nama tidak diinput, batalkan bergabung

    pairingCode = codeInput.value.trim();
    if (!pairingCode) return alert("Masukkan pairing code terlebih dahulu");

    setStatus("Menghubungkan ke server...");
    socket.emit("join", pairingCode);
};

socket.on("joined", async ({ users }) => {
    setStatus(`Bergabung. Total user lain: ${users.length}`);
    updateParticipantsCount(users.length);
    for (let id of users) {
        await createConnection(id, true); // initiator
    }
    document.getElementById("roomJoinSection").style.display = "none";
    document.getElementById("chatContainer").style.display = "flex";
    document.getElementById("leaveRoomSection").style.display = "block";

    // Menampilkan Room ID di UI
    document.getElementById("roomIdDisplay").textContent = `${pairingCode}`;
});

socket.on("user-joined", async (id) => {
    setStatus(`User baru bergabung: ${id}`);
    updateParticipantsCount(Object.keys(peerConnections).length + 1);
    await createConnection(id, false);
    notifSound.play();
});

socket.on("user-left", async (payload) => {
    const id = typeof payload === 'string' ? payload : payload.id;
    const name = typeof payload === 'object' ? payload.name : 'User';

    setStatus(`User keluar: ${name} (${id})`);
    updateParticipantsCount(Object.keys(peerConnections).length + 1);

    if (peerConnections[id]) {
        peerConnections[id].close();
        delete peerConnections[id];
    }

    const videoEl = document.getElementById(`remote-${id}`);
    if (videoEl && videoEl.parentElement) {
        videoEl.parentElement.remove(); // remove container
    }

    try { notifSound.play(); } catch (err) { console.warn("Sound error:", err); }
});


socket.on("offer", async ({ from, sdp }) => {
    await createConnection(from, false);
    await peerConnections[from].setRemoteDescription(new RTCSessionDescription(sdp));
    const answer = await peerConnections[from].createAnswer();
    await peerConnections[from].setLocalDescription(answer);
    socket.emit("answer", { to: from, sdp: peerConnections[from].localDescription });
});

socket.on("answer", async ({ from, sdp }) => {
    await peerConnections[from].setRemoteDescription(new RTCSessionDescription(sdp));
});

socket.on("ice-candidate", async ({ from, candidate }) => {
    if (peerConnections[from] && candidate) {
        await peerConnections[from].addIceCandidate(new RTCIceCandidate(candidate));
    }
});

// Fungsi untuk membuat koneksi peer
async function createConnection(id, isInitiator) {
    if (peerConnections[id]) return;

    const pc = new RTCPeerConnection(config);
    peerConnections[id] = pc;

    localStream.getTracks().forEach(track => pc.addTrack(track, localStream));

    pc.onicecandidate = (event) => {
        if (event.candidate) {
            socket.emit("ice-candidate", { to: id, candidate: event.candidate });
        }
    };

    pc.ontrack = (event) => {
        let video = document.getElementById(`remote-${id}`) || createVideoElement(id);
        video.srcObject = event.streams[0];
    };

    if (isInitiator) {
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        socket.emit("offer", { to: id, sdp: pc.localDescription });
    }
}

// Kirim pesan chat
chatSend.onclick = () => {
    const message = chatInput.value.trim();
    if (message) {
        socket.emit('chat-message', { message, room: pairingCode, from: userName });
        chatInput.value = "";
    }
};

// Tampilkan pesan chat
socket.on('chat-message', ({ from, message }) => {
    const messageDiv = document.createElement('div');
    messageDiv.className = "flex items-center gap-3 mt-2";
    messageDiv.innerHTML = `
        <div class="w-9 h-9 bg-gray-300 rounded-full"></div>
        <div class="bg-gray-100 text-gray-800 rounded-xl px-4 py-2 max-w-xs">
            <strong>${from}</strong>: ${message}
        </div>
    `;
    chatMessages.appendChild(messageDiv);
    chatMessages.scrollTop = chatMessages.scrollHeight; // auto-scroll
});

// Update jumlah peserta
function updateParticipantsCount(count) {
    participantsCount.textContent = count;
}

// Keluar dari room
leaveBtn.onclick = () => {
    socket.emit("leave", pairingCode);

    Object.keys(peerConnections).forEach((id) => {
        peerConnections[id].close();
        delete peerConnections[id];
    });

    localStream.getTracks().forEach(track => track.stop());

    document.getElementById("localVideo").srcObject = null;
    document.querySelectorAll("video[id^='remote-']").forEach((video) => video.remove());

    document.getElementById("roomJoinSection").style.display = "block";
    document.getElementById("chatContainer").style.display = "none";
    document.getElementById("leaveRoomSection").style.display = "none";

    chatMessages.innerHTML = ""; // clear chat

    setStatus("Anda telah keluar dari room.");
    setTimeout(() => {
        window.location.reload();  // Memuat ulang halaman
    }, 500);
};

// Toggle Video
toggleVideoBtn.onclick = () => {
    if (!localStream) return;
    isVideoOn = !isVideoOn;
    localStream.getVideoTracks().forEach(track => track.enabled = isVideoOn);
    toggleVideoBtn.textContent = isVideoOn ? "Stop Video" : "Start Video";
};

// Toggle Mic
toggleMicBtn.onclick = () => {
    if (!localStream) return;
    isMicOn = !isMicOn;
    localStream.getAudioTracks().forEach(track => track.enabled = isMicOn);
    toggleMicBtn.textContent = isMicOn ? "Mute Mic" : "Unmute Mic";
};

// Akses kamera dan audio ketika halaman dimuat untuk pratinjau
window.onload = async () => {
    await accessCameraPreview();
};
