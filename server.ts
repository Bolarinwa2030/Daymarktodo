import app from './server/src/index.js'

await app.listen({ port: Number(process.env.PORT ?? 3000), host: '0.0.0.0' })