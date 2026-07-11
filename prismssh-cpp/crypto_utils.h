#pragma once
#ifndef CRYPTO_UTILS_H
#define CRYPTO_UTILS_H

#include <string>

// Base64 helper declarations
std::string Base64Encode(const std::string& data);
std::string Base64Decode(const std::string& encoded_string);

// Symmetric AES 128 CBC helper declarations
std::string EncryptAES128CBC(const std::string& key, const std::string& iv, const std::string& plaintext);
std::string DecryptAES128CBC(const std::string& key, const std::string& iv, const std::string& ciphertext);

// HMAC-SHA256 hash helper declaration
std::string CalculateHmacSha256(const std::string& key, const std::string& data);

// Windows Data Protection API (DPAPI) helper declarations
std::string DpapiEncrypt(const std::string& plaintext);
std::string DpapiDecrypt(const std::string& ciphertext);

// Fernet symmetric cryptography declarations
std::string EncryptFernetPassword(const std::string& fernetKeyBase64, const std::string& plainText);
std::string DecryptFernetPassword(const std::string& fernetKeyBase64, const std::string& cipherTextBase64);
std::string LoadFernetKey();
std::string GetOrCreateFernetKey();

#endif // CRYPTO_UTILS_H
