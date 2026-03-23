
app.get('/solicitante', (req, res) => {
  res.sendFile(path.join(__dirname, '../frontend/solicitante.html'));
});

app.get('/tecnico', (req, res) => {
  res.sendFile(path.join(__dirname, '../frontend/tecnico.html'));
});
