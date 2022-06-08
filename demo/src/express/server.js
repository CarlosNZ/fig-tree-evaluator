const express = require('express')
const app = express()
const cors = require('cors')
const config = require('../config.json')
const port = config.postgresInterfacePort

const { Client } = require('pg')
const client = new Client(config.pg_database_connection)

client.connect()

app.use(cors())

app.listen(port, () => {
  console.log(`Postgres node middleware running at http://localhost:${port}`)
})

app.get('/pg-query', (req, res) => {
  const { text, values, rowMode } = req.query
  const valuesArray = values ? values.split(',') : []
  client
    .query({
      text: text,
      values: valuesArray,
      rowMode: rowMode ? rowMode : '',
    })
    .then((result) => {
      res.send(result)
    })
    .catch((err) => {
      console.log(err.message)
      res.send({ error: err.message })
    })
})
