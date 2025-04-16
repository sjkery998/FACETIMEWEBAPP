const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const rooms = {};

app.use(express.static('public'));

io.on('connection', (socket) => {
  console.log('User connected:', socket.id);

  socket.on('join', (pairingCode) => {
    if (!rooms[pairingCode]) rooms[pairingCode] = [];
    rooms[pairingCode].push(socket.id);
    socket.join(pairingCode);
    console.log(`${socket.id} joining room ${pairingCode}`);
    io.to(socket.id).emit('joined', rooms[pairingCode]);

    // Notify others
    socket.to(pairingCode).emit('user-joined', socket.id);
  });

  socket.on('offer', ({ pairingCode, sdp }) => {
    socket.to(pairingCode).emit('offer', { sdp });
  });

  socket.on('answer', ({ pairingCode, sdp }) => {
    socket.to(pairingCode).emit('answer', { sdp });
  });

  socket.on('ice-candidate', ({ pairingCode, candidate }) => {
    socket.to(pairingCode).emit('ice-candidate', { candidate });
  });

  socket.on('disconnect', () => {
    for (let code in rooms) {
      rooms[code] = rooms[code].filter(id => id !== socket.id);
      if (rooms[code].length === 0) delete rooms[code];
    }
    console.log('User disconnected:', socket.id);
  });
});

const PORT = 3000;
server.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});
