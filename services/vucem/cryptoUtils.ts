
// @ts-ignore
declare const forge: any;

export interface KeyPair {
    privateKey: any;
    certificate: any;
    certificatePem: string;
}

/**
 * Reads a Private Key file (.key) which is usually an Encrypted PKCS#8 or ASN.1 structure.
 * Returns the forge private key object.
 */
export const readPrivateKey = async (keyFile: File, password: string): Promise<any> => {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (e) => {
            try {
                const arrayBuffer = e.target?.result as ArrayBuffer;
                const binaryString = arrayBufferToBinaryString(arrayBuffer);
                const asn1 = forge.asn1.fromDer(binaryString);

                // Try parsing as Encrypted Private Key Info (PKCS#8)
                let privateKey;
                try {
                    privateKey = forge.pki.decryptRsaPrivateKey(asn1, password);
                } catch (err) {
                    // Fallback or specific error handling
                    console.error("Decryption failed", err);
                    reject(new Error("Contraseña incorrecta o formato de llave no soportado."));
                    return;
                }

                if (!privateKey) {
                    reject(new Error("No se pudo desencriptar la llave privada. Verifique la contraseña."));
                } else {
                    resolve(privateKey);
                }
            } catch (err) {
                reject(err);
            }
        };
        reader.onerror = (err) => reject(err);
        reader.readAsArrayBuffer(keyFile);
    });
};

/**
 * Reads a Certificate file (.cer)
 * Returns the forge certificate object and its PEM string.
 */
export const readCertificate = async (cerFile: File): Promise<{ cert: any, pem: string }> => {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (e) => {
            try {
                const arrayBuffer = e.target?.result as ArrayBuffer;
                const binaryString = arrayBufferToBinaryString(arrayBuffer);
                const asn1 = forge.asn1.fromDer(binaryString);
                const cert = forge.pki.certificateFromAsn1(asn1);
                const pem = forge.pki.certificateToPem(cert);
                resolve({ cert, pem });
            } catch (err) {
                reject(err);
            }
        };
        reader.onerror = (err) => reject(err);
        reader.readAsArrayBuffer(cerFile);
    });
};

/**
 * Helper to convert ArrayBuffer to Binary String for forge
 */
function arrayBufferToBinaryString(buffer: ArrayBuffer): string {
    let binary = '';
    const bytes = new Uint8Array(buffer);
    const len = bytes.byteLength;
    for (let i = 0; i < len; i++) {
        binary += String.fromCharCode(bytes[i]);
    }
    return binary;
}

/**
 * Generates an XML Signature for the Cadena Original.
 * VUCEM typically uses SHA256withRSA.
 */
export const signCadenaOriginal = (cadenaOriginal: string, privateKey: any): string => {
    const md = forge.md.sha256.create();
    md.update(cadenaOriginal, 'utf8');
    const signature = privateKey.sign(md);
    return forge.util.encode64(signature);
};

/**
 * Extracts the certificate body (base64) stripping headers
 */
export const getCertificateBody = (pem: string): string => {
    return pem
        .replace('-----BEGIN CERTIFICATE-----', '')
        .replace('-----END CERTIFICATE-----', '')
        .replace(/\r/g, '')
        .replace(/\n/g, '');
};

export const generateWSSEHeader = (username: string, password: string): string => {
    // Basic UsernameToken for VUCEM (Some services use signature, others just token)
    // Note: VUCEM often requires cleartext PasswordText for some services, or Digest for others.
    // ConsultarEdocument usually uses UsernameToken with PasswordText.

    return `
    <wsse:Security xmlns:wsse="http://docs.oasis-open.org/wss/2004/01/oasis-200401-wss-wssecurity-secext-1.0.xsd" xmlns:wsu="http://docs.oasis-open.org/wss/2004/01/oasis-200401-wss-wssecurity-utility-1.0.xsd">
        <wsse:UsernameToken wsu:Id="UsernameToken-1">
            <wsse:Username>${username}</wsse:Username>
            <wsse:Password Type="http://docs.oasis-open.org/wss/2004/01/oasis-200401-wss-username-token-profile-1.0#PasswordText">${password}</wsse:Password>
        </wsse:UsernameToken>
    </wsse:Security>`;
};
