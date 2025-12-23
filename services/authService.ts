
import { User, UserRole } from '../types.ts';

export const authService = {
    login: async (email: string, password: string): Promise<User | null> => {
        await new Promise(r => setTimeout(r, 500));
        let role = UserRole.VIEWER;
        if (email.includes('admin')) role = UserRole.ADMIN;
        else if (email.includes('ops')) role = UserRole.EDITOR;

        const user: User = {
            username: email.split('@')[0],
            name: email.split('@')[0],
            role,
            avatarInitials: email.substring(0, 2).toUpperCase()
        };
        localStorage.setItem('logimaster_user', JSON.stringify(user));
        return user;
    },
    // Senior Frontend Engineer: Added register method to match Login.tsx requirements.
    register: async (email: string, password: string): Promise<User | null> => {
        return authService.login(email, password);
    },
    logout: async () => localStorage.removeItem('logimaster_user'),
    getUsers: () => [
        { username: 'admin', name: 'Admin User', role: UserRole.ADMIN, avatarInitials: 'AD' },
        { username: 'ops', name: 'Operations', role: UserRole.EDITOR, avatarInitials: 'OP' },
    ]
};
