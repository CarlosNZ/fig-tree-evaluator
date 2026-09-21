/**
 * Stand-ins for the two Node-only packages the frozen v2 engine imports
 * by value — `pg` and `sqlite`, in v2-src/databaseConnections.ts. The
 * browser bundle (codegen/benchBrowser.mjs) aliases both here. Nothing in
 * a bench ever constructs them: SQL goes through the injected stub
 * connection, so these need only exist for the imports to resolve.
 */
export class Client {}
export class Database {}
