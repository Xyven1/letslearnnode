import { createServer } from 'http'
import { readFile } from 'fs'
import { v4 as uuidv4 } from 'uuid'
import path from 'path'
import redis from 'redis'
import { WebSocketServer, WebSocket } from 'ws'

var clients = []
const {createClient} = redis
const rdb = createClient()
const subscriber = rdb.duplicate()
rdb.on("error", function(error) {
  console.error(error);
})
subscriber.on("error", function(error) {
  console.error(error);
})
await rdb.connect()
await subscriber.connect()

async function subscribeKey(subscriber, key) {
  await subscriber.subscribe('__keyspace@0__:'+key, async message => {
    console.log(`"${key}" was set to: "${ await rdb.get(key)}"`)
  })
}

await subscribeKey(subscriber, 'test')

const server = createServer(function (req, res) {
  if (req.url == '/') req.url = '/index.html'
  readFile(path.join(path.resolve(), "static", req.url), (err,data) =>{
    if (err) return res.writeHead(404).end()
    res.writeHead(200).end(data)
  })
})
const wss = new WebSocketServer({ server, path: '/api'  });

wss.on('connection', function connection(ws) {
  const client = {ws, id: clients.length, user: null}
  clients.push(client)
  ws.on('message', async function incoming(message) {
    var message = JSON.parse(message.toString())
    switch (message.type) {
      case 'message':
        broadcast(wss, {type: 'message', message: message.message})
        break
      case 'login':
        let data = await rdb.hGetAll(`user:${message.username}`)
        if(!data.username){
          ws.send(JSON.stringify({type: 'login', success: false, message: 'User not found'}))
          break
        }
        if(data.password != message.password){
          ws.send(JSON.stringify({type: 'login', success: false, message: 'Wrong password'}))
          break
        }
        let sessionID = uuidv4()
        await rdb.hSet(`session:${sessionID}`, {username: message.username, sessionID: sessionID})
        await rdb.expire(`session:${sessionID}`, 60)
        ws.send(JSON.stringify({
          type: 'login',
          success: true,
          message: 'Login successful',
          sessionID,
          username: message.username
        }))
        client.user = {username: message.username}
        break
      case 'loginWithID':
        break
    }
    console.log('received: %s', message);
  });

});

function broadcast(wss, message) {
  wss.clients.forEach(function each(client) {
    if (client.readyState === WebSocket.OPEN)
      client.send(JSON.stringify(message))
  })
}
server.listen(8080);