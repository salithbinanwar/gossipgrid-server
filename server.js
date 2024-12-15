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
      'http://localhost:5000',
      'http://192.168.0.153:5000',
      'http://192.168.56.1:5000',
    ],
    methods: ['GET', 'POST'],
    credentials: true,
  }),
)

const io = new Server(server, {
  cors: {
    origin: [
      'https://gossipgrid.netlify.app',
      'http://localhost:5000',
      'http://192.168.0.153:5000',
      'http://192.168.56.1:5000',
    ],
    methods: ['GET', 'POST'],
    allowedHeaders: ['my-custom-header'],
    credentials: true,
    transports: ['websocket', 'polling'],
  },
  allowEIO3: true,
  pingTimeout: 60000,
})

// Track active users and their rooms
let activeUsers = new Set()
const userRooms = new Map() // To track which users are in which rooms

io.on('connection', (socket) => {
  console.log('User connected:', socket.id)
  activeUsers.add(socket.id)

  // Emit updated active users count to all clients
  io.emit('activePeople', activeUsers.size)

  // Handle messages
  socket.on('clientMessage', (data) => {
    if (data.room) {
      socket.to(data.room).emit('message', {
        message: data.message,
        username: data.username,
        room: data.room,
        timestamp: data.timestamp,
        isRoomMessage: true,
      })
    } else {
      socket.broadcast.emit('message', {
        message: data.message,
        username: data.username,
        timestamp: data.timestamp,
        isRoomMessage: false,
      })
    }
  })

  // Handle room creation
  socket.on('create_room', (username) => {
    const roomId = generateRoomId()
    socket.join(roomId)
    userRooms.set(socket.id, { room: roomId, username })

    // Notify room creation
    socket.emit('room_created', roomId)
    io.to(roomId).emit('room_notification', {
      type: 'create',
      username: username,
      message: `${username} created the room`,
    })

    // Update room members count
    const roomSize = io.sockets.adapter.rooms.get(roomId)?.size || 0
    io.to(roomId).emit('room_members', roomSize)
  })

  // Handle room joining
  socket.on('join_room', ({ room, username }) => {
    socket.join(room)
    userRooms.set(socket.id, { room, username })

    // Notify room joining
    socket.emit('room_joined', room)
    io.to(room).emit('room_notification', {
      type: 'join',
      username: username,
      message: `${username} joined the room`,
    })

    // Update room members count
    const roomSize = io.sockets.adapter.rooms.get(room)?.size || 0
    io.to(room).emit('room_members', roomSize)
  })

  // Handle room leaving
  socket.on('leave_room', ({ room, username }) => {
    socket.leave(room)
    userRooms.delete(socket.id)

    // Notify room leaving
    socket.emit('left_room_success')
    io.to(room).emit('room_notification', {
      type: 'leave',
      username: username,
      message: `${username} left the room`,
    })

    // Update room members count
    const roomSize = io.sockets.adapter.rooms.get(room)?.size || 0
    io.to(room).emit('room_members', roomSize)
  })

  // Handle disconnection
  socket.on('disconnect', () => {
    console.log('User disconnected:', socket.id)
    activeUsers.delete(socket.id)

    // Handle room cleanup if user was in a room
    const userRoom = userRooms.get(socket.id)
    if (userRoom) {
      const { room, username } = userRoom
      io.to(room).emit('room_notification', {
        type: 'leave',
        username: username,
        message: `${username} disconnected`,
      })

      // Update room members count
      const roomSize = (io.sockets.adapter.rooms.get(room)?.size || 1) - 1
      io.to(room).emit('room_members', roomSize)
      userRooms.delete(socket.id)
    }

    // Update active users count
    io.emit('activePeople', activeUsers.size)
  })
})

function generateRoomId() {
  return Math.random().toString(36).substring(2, 8)
}

const PORT = process.env.PORT || 3000
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`)
})
