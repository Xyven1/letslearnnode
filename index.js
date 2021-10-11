import { createServer } from 'http'
import { readFile } from 'fs'
import { performance } from 'perf_hooks'
import path from 'path'
import redis from 'redis'
import { WebSocketServer, WebSocket } from 'ws'

const {createClient} = redis
const client = createClient()
const subscriber = client.duplicate()
var start;
client.on("error", function(error) {
  console.error(error);
})
subscriber.on("error", function(error) {
  console.error(error);
})
await client.connect()
await subscriber.connect()

async function subscribeKey(subscriber, key) {
  await subscriber.subscribe('__keyspace@0__:'+key, async message => {
    console.log(`"${key}" was set to: "${ await client.get(key)}"`)
  })
}

await subscribeKey(subscriber, 'test')

client.get("test", redis.print).then(res=>console.log(res))
const server = createServer(function (req, res) {
  if (req.url == '/') req.url = '/index.html'
  readFile(path.join(path.resolve(), "static", req.url), (err,data) =>{
    if (err) return res.writeHead(404).end()
    res.writeHead(200).end(data)
  })
})
const wss = new WebSocketServer({ server, path: '/api'  });

wss.on('connection', function connection(ws) {
  ws.on('message', function incoming(message) {
    start = performance.now()
    var message = JSON.parse(message.toString())
    switch (message.type) {
      case 'message':
        broadcast(wss, {type: 'message', message: message.message})
        break
      case 'login':
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
  console.log("time:", performance.now() - start)
}
server.listen(8080);