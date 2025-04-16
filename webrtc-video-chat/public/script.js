const socket = io();
let localStream;
let peerConnection;
let isInitiator = false;
let pairingCode = '';
const config = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' }
  ]
};

const localVideo = document.getElementById("localVideo");
const remoteVideo = document.getElementById("remoteVideo");
const codeInput = document.getElementById("codeInput");
const joinBtn = document.getElementById("joinBtn");
const statusSpan = document.getElementById("status");

function setStatus(msg) {
  statusSpan.textContent = msg;
  console.log("[STATUS]", msg);
}

joinBtn.onclick = async () => {
  pairingCode = codeInput.value.trim();
  if (!pairingCode) return alert("Masukkan pairing code terlebih dahulu");

  setStatus("Mengakses kamera...");
  localStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
  localVideo.srcObject = localStream;

  setStatus("Menghubungkan ke server...");
  socket.emit("join", pairingCode);
};

socket.on("joined", (users) => {
  setStatus(`Bergabung ke room. Total pengguna: ${users.length}`);

  if (users.length > 1) {
    isInitiator = true;
    setStatus("Menjadi pengirim offer...");
    createPeerConnection();

    localStream.getTracks().forEach((track) => {
      peerConnection.addTrack(track, localStream);
    });

    peerConnection.createOffer()
      .then(offer => {
        setStatus("Mengirim offer...");
        return peerConnection.setLocalDescription(offer);
      })
      .then(() => {
        socket.emit("offer", { pairingCode, sdp: peerConnection.localDescription });
      });
  }
});

socket.on("offer", async ({ sdp }) => {
  setStatus("Menerima offer...");
  createPeerConnection();

  await peerConnection.setRemoteDescription(new RTCSessionDescription(sdp));

  localStream.getTracks().forEach((track) => {
    peerConnection.addTrack(track, localStream);
  });

  const answer = await peerConnection.createAnswer();
  await peerConnection.setLocalDescription(answer);

  setStatus("Mengirim jawaban (answer)...");
  socket.emit("answer", { pairingCode, sdp: peerConnection.localDescription });
});

socket.on("answer", async ({ sdp }) => {
  setStatus("Menerima jawaban (answer)...");
  await peerConnection.setRemoteDescription(new RTCSessionDescription(sdp));
});

socket.on("ice-candidate", async ({ candidate }) => {
  if (candidate && peerConnection) {
    try {
      await peerConnection.addIceCandidate(new RTCIceCandidate(candidate));
      setStatus("ICE candidate diterapkan");
    } catch (e) {
      console.error("Error adding ICE candidate", e);
    }
  }
});

function createPeerConnection() {
  if (peerConnection) return;

  peerConnection = new RTCPeerConnection(config);
  setStatus("PeerConnection dibuat");

  peerConnection.onicecandidate = (event) => {
    if (event.candidate) {
      socket.emit("ice-candidate", { pairingCode, candidate: event.candidate });
      setStatus("Mengirim ICE candidate...");
    }
  };

  peerConnection.ontrack = (event) => {
    setStatus("Stream remote diterima");
    remoteVideo.srcObject = event.streams[0];
  };

  peerConnection.onconnectionstatechange = () => {
    setStatus("Connection state: " + peerConnection.connectionState);
  };
}
