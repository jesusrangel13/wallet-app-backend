import { SmartMatcherService } from '../../services/voice/smartMatcher.service';

// Mock the shared prisma client
const mockFindMany = jest.fn();
jest.mock('../../utils/prisma', () => ({
    prisma: {
        categoryTemplate: {
            findMany: (...args: any[]) => mockFindMany(...args)
        },
        userCategoryOverride: {
            findMany: (...args: any[]) => mockFindMany(...args)
        }
    }
}));

describe('SmartMatcherService', () => {
    let service: SmartMatcherService;

    beforeEach(() => {
        jest.clearAllMocks();
        service = new SmartMatcherService();
    });

    it('should match "super" to "Supermercado"', async () => {
        const templates = [{ id: '1', name: 'Supermercado' }, { id: '2', name: 'Transporte' }];

        mockFindMany
            .mockResolvedValueOnce(templates) // categoryTemplate.findMany
            .mockResolvedValueOnce([])        // userCategoryOverride.findMany (overrides)
            .mockResolvedValueOnce([]);       // userCategoryOverride.findMany (custom)

        const result = await service.matchCategory('user-1', 'super');

        expect(result).not.toBeNull();
        expect(result?.name).toBe('Supermercado');
        expect(result?.confidence).toBeGreaterThan(0.4);
    });

    it('should match "uber" to "Transporte" if defined in overrides/custom', async () => {
        const templates = [{ id: '1', name: 'Supermercado' }, { id: '2', name: 'OriginalTransporte' }];
        const overrides = [{ id: 'custom-1', name: 'Transporte', templateId: '2' }];

        mockFindMany
            .mockResolvedValueOnce(templates) // templates call
            .mockResolvedValueOnce(overrides) // overrides call
            .mockResolvedValueOnce([]);       // custom call

        const result = await service.matchCategory('user-1', 'transpor');
        expect(result?.name).toBe('Transporte');
    });
});
