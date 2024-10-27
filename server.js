import cors from 'cors'
import express from 'express'
import { createServer } from 'http'
import { Server } from 'socket.io'

const app = express()
const server = createServer(app)

app.use(
  cors({
    origin: [
      'https://gossipgrid.netlify.app',
      'http://192.168.1.101:5000',
      'http://localhost:5000',
    ],
    methods: ['GET', 'POST'],
    credentials: true,
  }),
)

const io = new Server(server, {
  cors: {
    origin: [
      'https://gossipgrid.netlify.app',
      'http://192.168.1.101:5000',
      'http://localhost:5000',
    ],
    methods: ['GET', 'POST'],
    allowedHeaders: ['my-custom-header'],
    credentials: true,
    transports: ['websocket', 'polling'],
  },
  allowEIO3: true,
  pingTimeout: 60000,
})

let activeUsers = 0
const rooms = new Map() // To track active rooms and their members

function generateRoomId() {
  return Math.random().toString(36).substring(2, 8)
}

io.on('connection', (socket) => {
  activeUsers++
  io.emit('activePeople', activeUsers)

  // Handle messages
  socket.on('clientMessage', (data) => {
    const messageData = {
      message: data.message,
      username: data.username,
      room: data.room,
      isRoomMessage: !!data.room,
      timestamp: new Date().toISOString(),
    }

    if (data.room) {
      io.to(data.room).emit('message', {
        ...messageData,
        isRoomMessage: true,
      })
    } else {
      socket.broadcast.emit('message', {
        ...messageData,
        isRoomMessage: false,
      })
    }
  })

  // Create room
  socket.on('create_room', (username) => {
    const roomId = generateRoomId()
    socket.join(roomId)
    rooms.set(roomId, {
      creator: username,
      members: [{ username, socketId: socket.id }],
      created: new Date().toISOString(),
    })

    socket.emit('room_created', roomId)
    io.to(roomId).emit('message', {
      message: `Private room created. Only room members can see messages here.`,
      username: 'System',
      room: roomId,
      isRoomMessage: true,
      timestamp: new Date().toISOString(),
    })
  })

  // Join room
  socket.on('join_room', ({ room, username }) => {
    if (room && rooms.has(room)) {
      socket.join(room)
      const roomData = rooms.get(room)
      roomData.members.push({ username, socketId: socket.id })

      socket.emit('room_joined', room)
      io.to(room).emit('message', {
        message: `${username} has joined the room`,
        username: 'System',
        room: room,
        isRoomMessage: true,
        timestamp: new Date().toISOString(),
      })
    } else {
      socket.emit('room_error', 'Room not found')
    }
  })

  // Leave room
  socket.on('leave_room', ({ room, username }) => {
    if (room && rooms.has(room)) {
      socket.leave(room)
      const roomData = rooms.get(room)
      roomData.members = roomData.members.filter(
        (member) => member.username !== username,
      )

      // Send leave message only once to room members
      io.to(room).emit('message', {
        message: `${username} has left the room`,
        username: 'System',
        room: room,
        isRoomMessage: true,
        timestamp: new Date().toISOString(),
      })

      // Send success response to the leaving user
      socket.emit('left_room_success')

      // If room is empty, delete it
      if (roomData.members.length === 0) {
        rooms.delete(room)
      }
    }
  })

  socket.on('clearChat', ({ room, username }) => {
    socket.emit('chatCleared', { username })
  })

  socket.on('disconnect', () => {
    activeUsers--
    io.emit('activePeople', activeUsers)

    // Handle room cleanup on disconnect
    rooms.forEach((roomData, roomId) => {
      const member = roomData.members.find((m) => m.socketId === socket.id)
      if (member) {
        roomData.members = roomData.members.filter(
          (m) => m.socketId !== socket.id,
        )

        // Send disconnect message only once
        io.to(roomId).emit('message', {
          message: `${member.username} has disconnected`,
          username: 'System',
          room: roomId,
          isRoomMessage: true,
          timestamp: new Date().toISOString(),
        })

        if (roomData.members.length === 0) {
          rooms.delete(roomId)
        }
      }
    })
  })
})

const PORT = process.env.PORT || 3000
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`)
})
