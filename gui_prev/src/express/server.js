const express = require('express')
const app = express()
const cors = require('cors')
const config = require('../config.json')
const port = config.postgresInterfacePort

const { Client } = require('pg')
const { text } = require('express')
const client = new Client(config.pg_database_connection)

client.connect()

app.use(cors())

app.listen(port, () => {
  console.log(`Postgres node middleware running at http://localhost:${port}`)
})

app.get('/pg-query', (req, res) => {
  const { text, values, rowMode } = req.query
  const valuesArray = values ? values.split(',') : []
  // console.log('Query', text)
  // console.log('Values', valuesArray)
  // console.log('RowMode', rowMode)
  client
    .query({
      text: text,
      values: valuesArray,
      rowMode: rowMode ? rowMode : '',
    })
    .then((result) => {
      res.send(result)
    })
})
