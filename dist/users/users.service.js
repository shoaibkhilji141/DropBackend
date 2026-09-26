"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.UsersService = void 0;
const common_1 = require("@nestjs/common");
const prisma_service_1 = require("../common/prisma/prisma.service");
let UsersService = class UsersService {
    prisma;
    constructor(prisma) {
        this.prisma = prisma;
    }
    findAll() {
        return this.prisma.user.findMany({ orderBy: { createdAt: 'asc' } });
    }
    async findOne(id) {
        const user = await this.prisma.user.findUnique({ where: { id } });
        if (!user) {
            throw new common_1.NotFoundException(`User ${id} not found`);
        }
        return user;
    }
    async findCurrent(identity) {
        if (identity?.sub) {
            const existing = await this.prisma.user.findUnique({ where: { auth0Id: identity.sub } });
            if (existing)
                return existing;
            if (identity.email) {
                const byEmail = await this.prisma.user.findUnique({ where: { email: identity.email } });
                if (byEmail) {
                    return this.prisma.user.update({
                        where: { id: byEmail.id },
                        data: { auth0Id: identity.sub },
                    });
                }
            }
            return this.prisma.user.create({
                data: {
                    auth0Id: identity.sub,
                    email: identity.email ?? `${identity.sub.replace(/[^a-z0-9]/gi, '')}@auth.local`,
                    name: identity.email ?? 'Seller',
                },
            });
        }
        const user = await this.prisma.user.findFirst({ orderBy: { createdAt: 'asc' } });
        if (!user) {
            throw new common_1.NotFoundException('No user found. Run `npm run prisma:seed`.');
        }
        return user;
    }
};
exports.UsersService = UsersService;
exports.UsersService = UsersService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService])
], UsersService);
//# sourceMappingURL=users.service.js.map