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

    // Kirim daftar user lain (tidak termasuk dia sendiri)
    const otherUsers = rooms[pairingCode].filter(id => id !== socket.id);
    io.to(socket.id).emit('joined', { users: otherUsers });

    // Beritahu user lain bahwa ada yang baru
    otherUsers.forEach(userId => {
      io.to(userId).emit('user-joined', socket.id);
    });
  });

  socket.on('offer', ({ to, sdp }) => {
    io.to(to).emit('offer', { from: socket.id, sdp });
  });

  socket.on('answer', ({ to, sdp }) => {
    io.to(to).emit('answer', { from: socket.id, sdp });
  });

  socket.on('ice-candidate', ({ to, candidate }) => {
    io.to(to).emit('ice-candidate', { from: socket.id, candidate });
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
