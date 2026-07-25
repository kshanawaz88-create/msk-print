// Backward-compatible module name. The canonical route implementation includes
// the same authentication rate limiter used by the rest of the application.
module.exports = require("./printAgentAuthRoutes");
