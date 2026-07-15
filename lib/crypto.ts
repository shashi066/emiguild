export const encryptPhone = (text: string | null | undefined): string | null => {
  if (!text) return null;
  const key = process.env.NEXT_PUBLIC_PHONE_SECRET_KEY || 'default_secret';
  
  try {
    let xor = '';
    for (let i = 0; i < text.length; i++) {
      xor += String.fromCharCode(text.charCodeAt(i) ^ key.charCodeAt(i % key.length));
    }
    // Convert to base64
    if (typeof window !== 'undefined') {
      return btoa(xor);
    } else {
      return Buffer.from(xor, 'binary').toString('base64');
    }
  } catch (err) {
    return text;
  }
};

export const decryptPhone = (encryptedText: string | null | undefined): string | null => {
  if (!encryptedText) return null;
  
  // If it doesn't look like base64, return as is (in case of legacy plain text)
  if (!/^[A-Za-z0-9+/=]+$/.test(encryptedText)) {
    return encryptedText;
  }

  const key = process.env.NEXT_PUBLIC_PHONE_SECRET_KEY || 'default_secret';

  try {
    let xor = '';
    if (typeof window !== 'undefined') {
      xor = atob(encryptedText);
    } else {
      xor = Buffer.from(encryptedText, 'base64').toString('binary');
    }

    let text = '';
    for (let i = 0; i < xor.length; i++) {
      text += String.fromCharCode(xor.charCodeAt(i) ^ key.charCodeAt(i % key.length));
    }
    
    // Basic validation to check if decryption produced garbage
    // Phone numbers should generally be numeric or have some basic characters
    if (/^[0-9+\-\s()]*$/.test(text)) {
      return text;
    }
    
    return encryptedText; // Fallback if decryption fails basic validation
  } catch (err) {
    return encryptedText;
  }
};

export const encryptNumber = (num: number | null | undefined): string | null => {
  if (num === null || num === undefined) return null;
  return encryptPhone(String(num));
};

export const decryptNumber = (encryptedText: string | null | undefined): number | null => {
  if (!encryptedText) return null;
  const decryptedStr = decryptPhone(encryptedText);
  if (!decryptedStr) return null;
  const num = parseFloat(decryptedStr);
  return isNaN(num) ? null : num;
};
