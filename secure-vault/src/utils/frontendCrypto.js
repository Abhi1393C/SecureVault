/**
 * Encrypts a file in the browser using a fresh AES-256-GCM key,
 * and wraps (encrypts) that AES key using the user's Master PIN.
 */
export const encryptFileInBrowser = async (fileBuffer, userPin) => {
    try {
        const aesKey = await window.crypto.subtle.generateKey(
            { name: "AES-GCM", length: 256 },
            true,
            ["encrypt", "decrypt"]
        );

        const rawAesKey = await window.crypto.subtle.exportKey("raw", aesKey);
        const aesKeyString = btoa(String.fromCharCode(...new Uint8Array(rawAesKey)));

        const fileIv = window.crypto.getRandomValues(new Uint8Array(12));
        const encryptedFileBuffer = await window.crypto.subtle.encrypt(
            { name: "AES-GCM", iv: fileIv },
            aesKey,
            fileBuffer
        );

        // Raw Binary Array
        const filePayload = new Uint8Array(fileIv.length + encryptedFileBuffer.byteLength);
        filePayload.set(fileIv, 0);
        filePayload.set(new Uint8Array(encryptedFileBuffer), fileIv.length);

        const enc = new TextEncoder();
        const salt = enc.encode("secure-vault-master-salt-v1");
        
        const pinKeyMaterial = await window.crypto.subtle.importKey(
            "raw", enc.encode(userPin), { name: "PBKDF2" }, false, ["deriveKey"]
        );

        const derivedPinKey = await window.crypto.subtle.deriveKey(
            { name: "PBKDF2", salt: salt, iterations: 100000, hash: "SHA-256" },
            pinKeyMaterial, { name: "AES-GCM", length: 256 }, false, ["encrypt"]
        );

        const keyIv = window.crypto.getRandomValues(new Uint8Array(12));
        const wrappedKeyBuffer = await window.crypto.subtle.encrypt(
            { name: "AES-GCM", iv: keyIv }, derivedPinKey, new TextEncoder().encode(aesKeyString)
        );

        const wrappedKeyPayload = new Uint8Array(keyIv.length + wrappedKeyBuffer.byteLength);
        wrappedKeyPayload.set(keyIv, 0);
        wrappedKeyPayload.set(new Uint8Array(wrappedKeyBuffer), keyIv.length);

        const ownerWrappedKey = btoa(String.fromCharCode(...wrappedKeyPayload));

        return {
            fileData: filePayload, // 🚀 FIX: Sending raw Uint8Array directly, no Base64!
            ownerWrappedKey: ownerWrappedKey,
        };
    } catch (error) {
        console.error("Browser Encryption Error:", error);
        throw new Error("Failed to encrypt file locally.");
    }
};

/**
 * Decrypts the file buffer sent from the backend.
 */
export const decryptFileInBrowser = async (base64Data, aesKeyString) => {
    try {
        const binaryString = window.atob(base64Data);
        const rawData = new Uint8Array(binaryString.length);
        for (let i = 0; i < binaryString.length; i++) {
            rawData[i] = binaryString.charCodeAt(i);
        }

        // 🚀 FIX: Web Crypto already puts AuthTag at the end. 
        // We just need to separate the 12-byte IV from the rest of the payload.
        const iv = rawData.slice(0, 12);
        const webCryptoPayload = rawData.slice(12);

        // Decode the AES key (From our previous fix)
        const binaryStringKey = window.atob(aesKeyString);
        const rawKeyBytes = new Uint8Array(binaryStringKey.length);
        for (let i = 0; i < binaryStringKey.length; i++) {
            rawKeyBytes[i] = binaryStringKey.charCodeAt(i);
        }

        const keyMaterial = await window.crypto.subtle.importKey(
            "raw",
            rawKeyBytes, 
            { name: "AES-GCM" },
            false,
            ["decrypt"]
        );

        // Decrypt using the corrected payload
        const decryptedBuffer = await window.crypto.subtle.decrypt(
            { name: "AES-GCM", iv: iv },
            keyMaterial,
            webCryptoPayload
        );

        return decryptedBuffer;
    } catch (error) {
        console.error("Browser Decryption Error:", error);
        throw new Error("Failed to decrypt. Data might be corrupted or key is invalid.");
    }
};

/**
 * Unwraps the encrypted AES file key using the User's Master PIN.
 */
export const unwrapUserKey = async (wrappedKeyBase64, userPin) => {
    try {
        const enc = new TextEncoder();
        const salt = enc.encode("secure-vault-master-salt-v1");
        
        const pinKeyMaterial = await window.crypto.subtle.importKey(
            "raw",
            enc.encode(userPin),
            { name: "PBKDF2" },
            false,
            ["deriveKey"]
        );

        const derivedPinKey = await window.crypto.subtle.deriveKey(
            {
                name: "PBKDF2",
                salt: salt,
                iterations: 100000,
                hash: "SHA-256"
            },
            pinKeyMaterial,
            { name: "AES-GCM", length: 256 },
            false,
            ["decrypt"]
        );

        const binaryString = window.atob(wrappedKeyBase64);
        const rawData = new Uint8Array(binaryString.length);
        for (let i = 0; i < binaryString.length; i++) {
            rawData[i] = binaryString.charCodeAt(i);
        }

        const iv = rawData.slice(0, 12);
        const wrappedKeyCiphertext = rawData.slice(12);

        const decryptedKeyBuffer = await window.crypto.subtle.decrypt(
            { name: "AES-GCM", iv: iv },
            derivedPinKey,
            wrappedKeyCiphertext
        );

        const unwrappedAesKeyString = new TextDecoder().decode(decryptedKeyBuffer);
        return unwrappedAesKeyString;

    } catch (error) {
        console.error("Key unwrap failed:", error);
        throw new Error("Invalid Master PIN or corrupted key");
    }
};