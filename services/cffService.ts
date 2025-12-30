
import { Supplier } from '../types';

export type ValidationResult = {
    status: 'compliant' | 'warning' | 'blacklisted' | 'unchecked';
    message?: string;
};

// Simulated SAT 69-B Blacklist (Definitive)
// In a real app, this would query an API or a large dataset
const BLACKLIST_RFCS = [
    'EFO150212ABC', // Example EFOS
    'BAD990101XXX', // Example 2
    'FAKE800101000' // Example 3
];

const WARNING_RFCS = [
    'SUS100101000' // Under investigation
];

export const cffService = {
    /**
     * Validates a Partner according to CFF Rules (Mx Only)
     */
    validatePartner: (partner: Supplier): ValidationResult => {
        // Rule 1: Country Check (Mx Only)
        const isMexico = /mexico|méxico|mx/i.test(partner.country || '');
        if (!isMexico) {
            return { status: 'unchecked', message: 'Not a Mexican entity (CFF n/a)' };
        }

        // Rule 2: Missing RFC
        if (!partner.rfc || partner.rfc.trim() === '') {
            return { status: 'warning', message: 'Missing RFC for Mexican Partner' };
        }

        const rfc = partner.rfc.toUpperCase().trim();

        // Rule 3: RFC Syntax Check (Basic Regex)
        // Person: 4 letters + 6 digits + 3 homoclave
        // Company: 3 letters + 6 digits + 3 homoclave
        const rfcPattern = /^([A-ZÑ&]{3,4}) ?(?:- ?)?(\d{2}(?:0[1-9]|1[0-2])(?:0[1-9]|[12]\d|3[01])) ?(?:- ?)?([A-Z\d]{2})([A\d])$/;
        if (!rfcPattern.test(rfc)) {
            return { status: 'warning', message: 'Invalid RFC Format' };
        }

        // Rule 4: Blacklist Check (Art 69-B)
        if (BLACKLIST_RFCS.includes(rfc)) {
            return { status: 'blacklisted', message: 'CRITICAL: RFC found in SAT 69-B Blacklist' };
        }

        // Rule 5: Warning List
        if (WARNING_RFCS.includes(rfc)) {
            return { status: 'warning', message: 'RFC under SAT investigation (Presumptive)' };
        }

        return { status: 'compliant', message: 'RFC Valid & Not Blacklisted' };
    }
};
