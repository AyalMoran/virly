const config = {
  _id: "rs0",
  members: [
    {
      _id: 0,
      host: "mongo:27017"
    }
  ]
};

try {
  rs.status();
} catch (error) {
  rs.initiate(config);
}
