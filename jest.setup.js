// Jest setup file for database connection cleanup
// Ensures database connections are properly closed after tests

afterAll(async () => {
  // Give tests time to clean up
  await new Promise(resolve => setTimeout(resolve, 500))
})
