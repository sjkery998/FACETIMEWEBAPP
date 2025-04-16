const socket = io();
let localStream;
let peerConnections = {};
let pairingCode = '';
const config = {
  iceServers: [{ urls: 'stun:stun.l.google.com:19302' }]
};

const localVideo = document.getElementById("localVideo");
const remoteVideos = document.getElementById("remoteVideos");
const codeInput = document.getElementById("codeInput");
const joinBtn = document.getElementById("joinBtn");
const statusSpan = document.getElementById("status");

function setStatus(msg) {
  statusSpan.textContent = msg;
  console.log("[STATUS]", msg);
}

function createVideoElement(id) {
  let video = document.createElement('video');
  video.id = `remote-${id}`;
  video.autoplay = true;
  video.playsInline = true;
  remoteVideos.appendChild(video);
  return video;
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

socket.on("joined", async ({ users }) => {
    setStatus(`Bergabung. Total user lain: ${users.length}`);
    for (let id of users) {
      await createConnection(id, true); // initiator
    }
  });
  

socket.on("user-joined", async (id) => {
  setStatus(`User baru bergabung: ${id}`);
  await createConnection(id, false);
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
