import request from 'supertest';
import app from '../../server'; // Check if default export is app
import { env } from '../../config/env';

describe('Health Check Integration', () => {
    it('should return 200 and database connection status', async () => {
        const res = await request(app).get('/health');
        expect(res.status).toBe(200);
        expect(res.body).toHaveProperty('status', 'ok');
        expect(res.body).toHaveProperty('database', 'connected');
        expect(res.body).toHaveProperty('environment', env.NODE_ENV);
    });
});
