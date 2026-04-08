// WebRTC Socket Handlers for Video Conferencing

module.exports = (io) => {
  const rooms = new Map(); // Store room information

  io.on('connection', (socket) => {
    console.log(`User connected: ${socket.id}`);

    // Join training room
    socket.on('join-room', ({ roomId, userId, userName, isTrainer }) => {
      console.log(`User ${userName} (${userId}) joining room: ${roomId}`);
      
      socket.join(roomId);
      socket.userId = userId;
      socket.userName = userName;
      socket.roomId = roomId;
      socket.isTrainer = isTrainer;

      // Initialize room if not exists
      if (!rooms.has(roomId)) {
        rooms.set(roomId, {
          participants: new Map(),
          trainer: null,
          createdAt: new Date()
        });
      }

      const room = rooms.get(roomId);
      
      // Set trainer if this user is trainer
      if (isTrainer) {
        room.trainer = { userId, userName, socketId: socket.id };
      }

      // Add participant
      room.participants.set(userId, {
        userId,
        userName,
        socketId: socket.id,
        isTrainer,
        joinedAt: new Date()
      });

      // Notify others in room
      socket.to(roomId).emit('user-joined', {
        userId,
        userName,
        isTrainer,
        participants: Array.from(room.participants.values()).map(p => ({
          userId: p.userId,
          userName: p.userName,
          isTrainer: p.isTrainer
        }))
      });

      // Send current participants to new user
      socket.emit('room-joined', {
        roomId,
        participants: Array.from(room.participants.values()).map(p => ({
          userId: p.userId,
          userName: p.userName,
          isTrainer: p.isTrainer
        })),
        trainer: room.trainer
      });

      console.log(`Room ${roomId} now has ${room.participants.size} participants`);
    });

    // WebRTC Signaling - Offer
    socket.on('offer', ({ targetUserId, offer }) => {
      const room = rooms.get(socket.roomId);
      if (!room) return;

      const targetParticipant = room.participants.get(targetUserId);
      if (targetParticipant) {
        io.to(targetParticipant.socketId).emit('offer', {
          userId: socket.userId,
          userName: socket.userName,
          offer
        });
      }
    });

    // WebRTC Signaling - Answer
    socket.on('answer', ({ targetUserId, answer }) => {
      const room = rooms.get(socket.roomId);
      if (!room) return;

      const targetParticipant = room.participants.get(targetUserId);
      if (targetParticipant) {
        io.to(targetParticipant.socketId).emit('answer', {
          userId: socket.userId,
          answer
        });
      }
    });

    // WebRTC Signaling - ICE Candidate
    socket.on('ice-candidate', ({ targetUserId, candidate }) => {
      const room = rooms.get(socket.roomId);
      if (!room) return;

      const targetParticipant = room.participants.get(targetUserId);
      if (targetParticipant) {
        io.to(targetParticipant.socketId).emit('ice-candidate', {
          userId: socket.userId,
          candidate
        });
      }
    });

    // Screen share start
    socket.on('screen-share-started', () => {
      socket.to(socket.roomId).emit('screen-share-started', {
        userId: socket.userId,
        userName: socket.userName
      });
    });

    // Screen share stop
    socket.on('screen-share-stopped', () => {
      socket.to(socket.roomId).emit('screen-share-stopped', {
        userId: socket.userId
      });
    });

    // Recording start
    socket.on('recording-started', () => {
      socket.to(socket.roomId).emit('recording-started', {
        userId: socket.userId,
        userName: socket.userName,
        timestamp: new Date()
      });
    });

    // Recording stop
    socket.on('recording-stopped', ({ recordingUrl }) => {
      socket.to(socket.roomId).emit('recording-stopped', {
        userId: socket.userId,
        recordingUrl,
        timestamp: new Date()
      });
    });

    // Chat message
    socket.on('chat-message', ({ message, type = 'text' }) => {
      const room = rooms.get(socket.roomId);
      if (!room) return;

      const chatMessage = {
        userId: socket.userId,
        userName: socket.userName,
        isTrainer: socket.isTrainer,
        message,
        type,
        timestamp: new Date()
      };

      // Broadcast to all in room including sender
      io.to(socket.roomId).emit('chat-message', chatMessage);
    });

    // Raise hand
    socket.on('raise-hand', () => {
      socket.to(socket.roomId).emit('hand-raised', {
        userId: socket.userId,
        userName: socket.userName
      });
    });

    // Lower hand
    socket.on('lower-hand', () => {
      socket.to(socket.roomId).emit('hand-lowered', {
        userId: socket.userId
      });
    });

    // Mute/unmute user (trainer only)
    socket.on('mute-user', ({ targetUserId }) => {
      if (!socket.isTrainer) return;

      const room = rooms.get(socket.roomId);
      if (!room) return;

      const targetParticipant = room.participants.get(targetUserId);
      if (targetParticipant) {
        io.to(targetParticipant.socketId).emit('muted-by-trainer');
      }
    });

    // Remove user (trainer only)
    socket.on('remove-user', ({ targetUserId }) => {
      if (!socket.isTrainer) return;

      const room = rooms.get(socket.roomId);
      if (!room) return;

      const targetParticipant = room.participants.get(targetUserId);
      if (targetParticipant) {
        io.to(targetParticipant.socketId).emit('removed-by-trainer');
      }
    });

    // End session (trainer only)
    socket.on('end-session', () => {
      if (!socket.isTrainer) return;

      const room = rooms.get(socket.roomId);
      if (!room) return;

      // Notify all participants
      io.to(socket.roomId).emit('session-ended', {
        endedBy: socket.userName,
        timestamp: new Date()
      });

      // Clear room
      rooms.delete(socket.roomId);
    });

    // Disconnect
    socket.on('disconnect', () => {
      console.log(`User disconnected: ${socket.id}`);

      if (socket.roomId && rooms.has(socket.roomId)) {
        const room = rooms.get(socket.roomId);
        
        // Remove participant
        room.participants.delete(socket.userId);

        // Notify others
        socket.to(socket.roomId).emit('user-left', {
          userId: socket.userId,
          userName: socket.userName,
          participants: Array.from(room.participants.values()).map(p => ({
            userId: p.userId,
            userName: p.userName,
            isTrainer: p.isTrainer
          }))
        });

        // Clean up empty rooms
        if (room.participants.size === 0) {
          rooms.delete(socket.roomId);
          console.log(`Room ${socket.roomId} deleted (empty)`);
        }
      }
    });
  });

  // Helper function to get room stats
  const getRoomStats = () => {
    const stats = {
      totalRooms: rooms.size,
      rooms: []
    };

    rooms.forEach((room, roomId) => {
      stats.rooms.push({
        roomId,
        participantCount: room.participants.size,
        trainer: room.trainer?.userName,
        createdAt: room.createdAt
      });
    });

    return stats;
  };

  // Expose stats function
  global.getVideoRoomStats = getRoomStats;
};
