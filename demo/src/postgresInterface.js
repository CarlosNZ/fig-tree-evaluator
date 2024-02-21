import config from './config.json'
const port = config.postgresInterfacePort

export class PostgresInterface {
  query = async (expression) => {
    const { text, values, rowMode } = expression
    const valuesQuery = values ? `&values=${values}` : ''
    const rowModeQuery = rowMode ? `&rowMode=${rowMode}` : ''
    const url = `http://localhost:${port}/pg-query?text=${text}${valuesQuery}${rowModeQuery}`
    const result = await fetch(url)
    return result.json()
  }
}
