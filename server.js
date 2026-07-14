const express = require('express');
const app = express();
app.use(express.json());

app.get('/', (req, res) => {
  res.send('Hello, server!');
});

app.listen(3000, () => console.log('Server running on http://localhost:3000'));