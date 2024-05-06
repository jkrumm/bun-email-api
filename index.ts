const server = Bun.serve({
  port: 3002,
  fetch(req) {
    return new Response("Bunny!");
  },
});

console.log(`Listening on http://localhost:${server.port} ...`);
