import React, { createContext, useContext, useState, ReactNode } from 'react';

type NotificationType = 'success' | 'error' | 'info' | 'warning';

interface NotificationState {
    isOpen: boolean;
    title: string;
    message: string;
    type: NotificationType;
}

interface NotificationContextProps {
    notification: NotificationState;
    showNotification: (title: string, message: string, type?: NotificationType) => void;
    hideNotification: () => void;
}

const NotificationContext = createContext<NotificationContextProps | undefined>(undefined);

export const NotificationProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
    const [notification, setNotification] = useState<NotificationState>({
        isOpen: false,
        title: '',
        message: '',
        type: 'info'
    });

    const showNotification = (title: string, message: string, type: NotificationType = 'info') => {
        setNotification({
            isOpen: true,
            title,
            message,
            type
        });
    };

    const hideNotification = () => {
        setNotification(prev => ({ ...prev, isOpen: false }));
    };

    return (
        <NotificationContext.Provider value={{ notification, showNotification, hideNotification }}>
            {children}
        </NotificationContext.Provider>
    );
};

export const useNotification = () => {
    const context = useContext(NotificationContext);
    if (!context) {
        throw new Error('useNotification must be used within a NotificationProvider');
    }
    return context;
};
