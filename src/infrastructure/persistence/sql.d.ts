// Migrations are bundled as strings (electron-vite / Vitest `?raw` imports).
declare module '*.sql?raw' {
  const sql: string
  export default sql
}
