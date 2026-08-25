#define WIN32_LEAN_AND_MEAN
#include <windows.h>
#include <bcrypt.h>
#include <dpapi.h>
#include <stdlib.h>
#include <time.h>
#include <vector>
#define OPENSSL_SUPPRESS_DEPRECATED
#pragma warning(push)
#pragma warning(disable: 4996)
#include <openssl/des.h>
#include <openssl/md5.h>
#pragma warning(pop)
#include "crypto_utils.h"
#include "common_utils.h"

#pragma comment(lib, "bcrypt.lib")
#pragma comment(lib, "crypt32.lib")

static const std::string base64_chars = 
             "ABCDEFGHIJKLMNOPQRSTUVWXYZ"
             "abcdefghijklmnopqrstuvwxyz"
             "0123456789+/";

inline bool is_base64(unsigned char c) {
  return (isalnum(c) || (c == '+') || (c == '/'));
}

std::string Base64Encode(const std::string& data) {
    std::string out;
    int val = 0, valb = -6;
    for (unsigned char c : data) {
        val = (val << 8) + c;
        valb += 8;
        while (valb >= 0) {
            out.push_back(base64_chars[(val >> valb) & 0x3F]);
            valb -= 6;
        }
    }
    if (valb > -6) out.push_back(base64_chars[((val << 8) >> (valb + 8)) & 0x3F]);
    while (out.size() % 4) out.push_back('=');
    return out;
}

std::string Base64Decode(std::string const& encoded_string) {
  int i = 0;
  int j = 0;
  int in_ = 0;
  unsigned char char_array_4[4], char_array_3[3];
  std::string ret;

  std::string clean_encoded = encoded_string;
  for (char& c : clean_encoded) {
      if (c == '-') c = '+';
      else if (c == '_') c = '/';
  }
  while (clean_encoded.size() % 4 != 0) {
      clean_encoded += '=';
  }

  int in_len = (int)clean_encoded.size();

  while (in_len-- && ( clean_encoded[in_] != '=') && is_base64(clean_encoded[in_])) {
    char_array_4[i++] = clean_encoded[in_]; in_++;
    if (i == 4) {
      for (i = 0; i < 4; i++)
        char_array_4[i] = (unsigned char)base64_chars.find(char_array_4[i]);

      char_array_3[0] = (char_array_4[0] << 2) + ((char_array_4[1] & 0x30) >> 4);
      char_array_3[1] = ((char_array_4[1] & 0xf) << 4) + ((char_array_4[2] & 0x3c) >> 2);
      char_array_3[2] = ((char_array_4[2] & 0x3) << 6) + char_array_4[3];

      for (i = 0; i < 3; i++)
        ret += char_array_3[i];
      i = 0;
    }
  }

  if (i) {
    for (j = i; j < 4; j++)
      char_array_4[j] = 0;

    for (j = 0; j < 4; j++)
      char_array_4[j] = (unsigned char)base64_chars.find(char_array_4[j]);

    char_array_3[0] = (char_array_4[0] << 2) + ((char_array_4[1] & 0x30) >> 4);
    char_array_3[1] = ((char_array_4[1] & 0xf) << 4) + ((char_array_4[2] & 0x3c) >> 2);
    char_array_3[2] = ((char_array_4[2] & 0x3) << 6) + char_array_4[3];

    for (j = 0; (j < i - 1); j++) ret += char_array_3[j];
  }

  return ret;
}

std::string EncryptAES128CBC(const std::string& key, const std::string& iv, const std::string& plaintext) {
    BCRYPT_ALG_HANDLE hAlg = NULL;
    BCRYPT_KEY_HANDLE hKey = NULL;
    DWORD cbKeyObject = 0, cbData = 0;
    PBYTE pbKeyObject = NULL;
    std::string ciphertext;

    if (BCryptOpenAlgorithmProvider(&hAlg, BCRYPT_AES_ALGORITHM, NULL, 0) != 0) return "";
    
    if (BCryptSetProperty(hAlg, BCRYPT_CHAINING_MODE, (PBYTE)BCRYPT_CHAIN_MODE_CBC, sizeof(BCRYPT_CHAIN_MODE_CBC), 0) != 0) {
        BCryptCloseAlgorithmProvider(hAlg, 0);
        return "";
    }

    if (BCryptGetProperty(hAlg, BCRYPT_OBJECT_LENGTH, (PBYTE)&cbKeyObject, sizeof(DWORD), &cbData, 0) != 0) {
        BCryptCloseAlgorithmProvider(hAlg, 0);
        return "";
    }

    pbKeyObject = (PBYTE)HeapAlloc(GetProcessHeap(), 0, cbKeyObject);
    if (pbKeyObject == NULL) {
        BCryptCloseAlgorithmProvider(hAlg, 0);
        return "";
    }

    if (BCryptGenerateSymmetricKey(hAlg, &hKey, pbKeyObject, cbKeyObject, (PBYTE)key.data(), (ULONG)key.size(), 0) != 0) {
        HeapFree(GetProcessHeap(), 0, pbKeyObject);
        BCryptCloseAlgorithmProvider(hAlg, 0);
        return "";
    }

    size_t padLen = 16 - (plaintext.size() % 16);
    std::string paddedText = plaintext;
    paddedText.append(padLen, (char)padLen);

    std::string ivCopy = iv;
    DWORD cbCipherText = 0;

    if (BCryptEncrypt(hKey, (PBYTE)paddedText.data(), (ULONG)paddedText.size(), NULL, (PBYTE)ivCopy.data(), (ULONG)ivCopy.size(), NULL, 0, &cbCipherText, 0) != 0) {
        BCryptDestroyKey(hKey);
        HeapFree(GetProcessHeap(), 0, pbKeyObject);
        BCryptCloseAlgorithmProvider(hAlg, 0);
        return "";
    }

    ciphertext.resize(cbCipherText);
    if (BCryptEncrypt(hKey, (PBYTE)paddedText.data(), (ULONG)paddedText.size(), NULL, (PBYTE)ivCopy.data(), (ULONG)ivCopy.size(), (PBYTE)ciphertext.data(), cbCipherText, &cbCipherText, 0) != 0) {
        BCryptDestroyKey(hKey);
        HeapFree(GetProcessHeap(), 0, pbKeyObject);
        BCryptCloseAlgorithmProvider(hAlg, 0);
        return "";
    }

    BCryptDestroyKey(hKey);
    HeapFree(GetProcessHeap(), 0, pbKeyObject);
    BCryptCloseAlgorithmProvider(hAlg, 0);

    return ciphertext;
}

std::string DecryptAES128CBC(const std::string& key, const std::string& iv, const std::string& ciphertext) {
    BCRYPT_ALG_HANDLE hAlg = NULL;
    BCRYPT_KEY_HANDLE hKey = NULL;
    DWORD cbKeyObject = 0, cbData = 0;
    PBYTE pbKeyObject = NULL;
    std::string plaintext;

    if (BCryptOpenAlgorithmProvider(&hAlg, BCRYPT_AES_ALGORITHM, NULL, 0) != 0) return "";
    
    if (BCryptSetProperty(hAlg, BCRYPT_CHAINING_MODE, (PBYTE)BCRYPT_CHAIN_MODE_CBC, sizeof(BCRYPT_CHAIN_MODE_CBC), 0) != 0) {
        BCryptCloseAlgorithmProvider(hAlg, 0);
        return "";
    }

    if (BCryptGetProperty(hAlg, BCRYPT_OBJECT_LENGTH, (PBYTE)&cbKeyObject, sizeof(DWORD), &cbData, 0) != 0) {
        BCryptCloseAlgorithmProvider(hAlg, 0);
        return "";
    }

    pbKeyObject = (PBYTE)HeapAlloc(GetProcessHeap(), 0, cbKeyObject);
    if (pbKeyObject == NULL) {
        BCryptCloseAlgorithmProvider(hAlg, 0);
        return "";
    }

    if (BCryptGenerateSymmetricKey(hAlg, &hKey, pbKeyObject, cbKeyObject, (PBYTE)key.data(), (ULONG)key.size(), 0) != 0) {
        HeapFree(GetProcessHeap(), 0, pbKeyObject);
        BCryptCloseAlgorithmProvider(hAlg, 0);
        return "";
    }

    std::string ivCopy = iv;
    DWORD cbPlainText = 0;

    if (BCryptDecrypt(hKey, (PBYTE)ciphertext.data(), (ULONG)ciphertext.size(), NULL, (PBYTE)ivCopy.data(), (ULONG)ivCopy.size(), NULL, 0, &cbPlainText, 0) != 0) {
        BCryptDestroyKey(hKey);
        HeapFree(GetProcessHeap(), 0, pbKeyObject);
        BCryptCloseAlgorithmProvider(hAlg, 0);
        return "";
    }

    plaintext.resize(cbPlainText);
    if (BCryptDecrypt(hKey, (PBYTE)ciphertext.data(), (ULONG)ciphertext.size(), NULL, (PBYTE)ivCopy.data(), (ULONG)ivCopy.size(), (PBYTE)plaintext.data(), cbPlainText, &cbPlainText, 0) != 0) {
        BCryptDestroyKey(hKey);
        HeapFree(GetProcessHeap(), 0, pbKeyObject);
        BCryptCloseAlgorithmProvider(hAlg, 0);
        return "";
    }

    if (!plaintext.empty()) {
        unsigned char padVal = plaintext.back();
        if (padVal >= 1 && padVal <= 16 && plaintext.size() >= padVal) {
            bool validPad = true;
            for (size_t i = plaintext.size() - padVal; i < plaintext.size(); ++i) {
                if (plaintext[i] != padVal) {
                    validPad = false;
                    break;
                }
            }
            if (validPad) {
                plaintext.resize(plaintext.size() - padVal);
            }
        }
    }

    BCryptDestroyKey(hKey);
    HeapFree(GetProcessHeap(), 0, pbKeyObject);
    BCryptCloseAlgorithmProvider(hAlg, 0);

    return plaintext;
}

std::string CalculateHmacSha256(const std::string& key, const std::string& data) {
    BCRYPT_ALG_HANDLE hAlg = NULL;
    BCRYPT_HASH_HANDLE hHash = NULL;
    DWORD cbHash = 0, cbData = 0;
    std::string hashVal;

    if (BCryptOpenAlgorithmProvider(&hAlg, BCRYPT_SHA256_ALGORITHM, NULL, BCRYPT_ALG_HANDLE_HMAC_FLAG) != 0) return "";

    if (BCryptGetProperty(hAlg, BCRYPT_HASH_LENGTH, (PBYTE)&cbHash, sizeof(DWORD), &cbData, 0) != 0) {
        BCryptCloseAlgorithmProvider(hAlg, 0);
        return "";
    }

    if (BCryptCreateHash(hAlg, &hHash, NULL, 0, (PBYTE)key.data(), (ULONG)key.size(), 0) != 0) {
        BCryptCloseAlgorithmProvider(hAlg, 0);
        return "";
    }

    if (BCryptHashData(hHash, (PBYTE)data.data(), (ULONG)data.size(), 0) != 0) {
        BCryptDestroyHash(hHash);
        BCryptCloseAlgorithmProvider(hAlg, 0);
        return "";
    }

    hashVal.resize(cbHash);
    if (BCryptFinishHash(hHash, (PBYTE)hashVal.data(), cbHash, 0) != 0) {
        BCryptDestroyHash(hHash);
        BCryptCloseAlgorithmProvider(hAlg, 0);
        return "";
    }

    BCryptDestroyHash(hHash);
    BCryptCloseAlgorithmProvider(hAlg, 0);

    return hashVal;
}

std::string DpapiEncrypt(const std::string& plaintext) {
    DATA_BLOB dataIn;
    dataIn.pbData = (BYTE*)plaintext.data();
    dataIn.cbData = (DWORD)plaintext.size();
    
    DATA_BLOB dataOut;
    BOOL ok = CryptProtectData(
        &dataIn,
        L"LdySSH Security Key",
        NULL,
        NULL,
        NULL,
        0,
        &dataOut
    );
    if (!ok) return "";
    std::string result((char*)dataOut.pbData, dataOut.cbData);
    LocalFree(dataOut.pbData);
    return result;
}

std::string DpapiDecrypt(const std::string& ciphertext) {
    DATA_BLOB dataIn;
    dataIn.pbData = (BYTE*)ciphertext.data();
    dataIn.cbData = (DWORD)ciphertext.size();
    
    DATA_BLOB dataOut;
    LPWSTR pDescr = NULL;
    BOOL ok = CryptUnprotectData(
        &dataIn,
        &pDescr,
        NULL,
        NULL,
        NULL,
        0,
        &dataOut
    );
    if (!ok) return "";
    std::string result((char*)dataOut.pbData, dataOut.cbData);
    LocalFree(dataOut.pbData);
    if (pDescr) LocalFree(pDescr);
    return result;
}

std::string EncryptFernetPassword(const std::string& fernetKeyBase64, const std::string& plainText) {
    std::string rawKey = Base64Decode(fernetKeyBase64);
    if (rawKey.size() != 32) return "";

    std::string iv(16, '\0');
    BCRYPT_ALG_HANDLE hRng = NULL;
    if (BCryptOpenAlgorithmProvider(&hRng, BCRYPT_RNG_ALGORITHM, NULL, 0) == 0) {
        BCryptGenRandom(hRng, (PUCHAR)iv.data(), 16, 0);
        BCryptCloseAlgorithmProvider(hRng, 0);
    } else {
        for (int i = 0; i < 16; ++i) iv[i] = (char)(rand() % 256);
    }

    std::string header(9, '\0');
    header[0] = (char)0x80;
    
    long long timestamp = (long long)time(NULL);
    for (int i = 0; i < 8; ++i) {
        header[8 - i] = (char)(timestamp & 0xFF);
        timestamp >>= 8;
    }

    std::string aesKey = rawKey.substr(16, 16);
    std::string ciphertext = EncryptAES128CBC(aesKey, iv, plainText);
    if (ciphertext.empty()) return "";

    std::string signTarget = header + iv + ciphertext;

    std::string hmacKey = rawKey.substr(0, 16);
    std::string hmacVal = CalculateHmacSha256(hmacKey, signTarget);
    if (hmacVal.empty()) return "";

    std::string finalRaw = signTarget + hmacVal;
    return Base64Encode(finalRaw);
}

std::string DecryptFernetPassword(const std::string& fernetKeyBase64, const std::string& cipherTextBase64) {
    std::string rawKey = Base64Decode(fernetKeyBase64);
    if (rawKey.size() != 32) return "";

    std::string rawCipher = Base64Decode(cipherTextBase64);
    if (rawCipher.size() < 9 + 16 + 32) return "";

    if ((unsigned char)rawCipher[0] != 0x80) return "";

    std::string hmacKey = rawKey.substr(0, 16);
    std::string signTarget = rawCipher.substr(0, rawCipher.size() - 32);
    std::string expectedHmac = rawCipher.substr(rawCipher.size() - 32);
    std::string actualHmac = CalculateHmacSha256(hmacKey, signTarget);
    
    if (actualHmac.size() != expectedHmac.size()) return "";
    int result = 0;
    for (size_t i = 0; i < actualHmac.size(); ++i) {
        result |= (actualHmac[i] ^ expectedHmac[i]);
    }
    if (result != 0) {
        return "";
    }

    std::string iv = rawCipher.substr(9, 16);
    std::string actualCiphertext = rawCipher.substr(25, rawCipher.size() - 25 - 32);
    std::string aesKey = rawKey.substr(16, 16);

    return DecryptAES128CBC(aesKey, iv, actualCiphertext);
}

// 帮助函数，读取二进制或进行 DPAPI 存储
static std::string LocalReadBinaryFile(const std::wstring& path) {
    std::ifstream f(path, std::ios::binary);
    if (!f.is_open()) return "";
    return std::string((std::istreambuf_iterator<char>(f)), std::istreambuf_iterator<char>());
}

static bool LocalWriteBinaryFile(const std::wstring& path, const std::string& data) {
    std::ofstream f(path, std::ios::binary);
    if (!f.is_open()) return false;
    f.write(data.data(), data.size());
    return true;
}

std::string LoadFernetKey() {
    std::wstring configDir = GetConfigDirectory();
    std::wstring keyPath = configDir + L"\\.key";

    std::string encryptedKey = LocalReadBinaryFile(keyPath);
    if (encryptedKey.empty()) return "";
    return DpapiDecrypt(encryptedKey);
}

std::string GetOrCreateFernetKey() {
    std::wstring configDir = GetConfigDirectory();
    std::wstring keyPath = configDir + L"\\.key";
    
    std::string existingKey = LoadFernetKey();
    if (!existingKey.empty()) {
        return existingKey;
    }

    std::string rawKey(32, '\0');
    BCRYPT_ALG_HANDLE hRng = NULL;
    if (BCryptOpenAlgorithmProvider(&hRng, BCRYPT_RNG_ALGORITHM, NULL, 0) == 0) {
        BCryptGenRandom(hRng, (PUCHAR)rawKey.data(), 32, 0);
        BCryptCloseAlgorithmProvider(hRng, 0);
    } else {
        srand((unsigned int)time(NULL));
        for (int i = 0; i < 32; ++i) rawKey[i] = (char)(rand() % 256);
    }

    std::string keyBase64 = Base64Encode(rawKey);
    std::string encrypted = DpapiEncrypt(keyBase64);
    if (!encrypted.empty()) {
        LocalWriteBinaryFile(keyPath, encrypted);
    }
    
    std::wstring keyInfoPath = configDir + L"\\.key_info";
    std::string rawSalt(32, '\0');
    if (BCryptOpenAlgorithmProvider(&hRng, BCRYPT_RNG_ALGORITHM, NULL, 0) == 0) {
        BCryptGenRandom(hRng, (PUCHAR)rawSalt.data(), 32, 0);
        BCryptCloseAlgorithmProvider(hRng, 0);
    }
    WriteUtf8ToFile(keyInfoPath, rawSalt);

    return keyBase64;
}

namespace {
class JavaRandom {
private:
    uint64_t seed;
    static const uint64_t multiplier = 0x5DEECE66DULL;
    static const uint64_t addend = 0xBULL;
    static const uint64_t mask = (1ULL << 48) - 1;

public:
    explicit JavaRandom(int64_t s) {
        setSeed(s);
    }

    void setSeed(int64_t s) {
        seed = ((uint64_t)s ^ multiplier) & mask;
    }

    int32_t next(int bits) {
        seed = (seed * multiplier + addend) & mask;
        return (int32_t)(seed >> (48 - bits));
    }

    int32_t nextInt(int32_t bound) {
        if (bound <= 0) return 0;
        if ((bound & -bound) == bound) {
            return (int32_t)((bound * (int64_t)next(31)) >> 31);
        }
        int32_t bits, val;
        do {
            bits = next(31);
            val = bits % bound;
        } while (bits - val + (bound - 1) < 0);
        return val;
    }

    int64_t nextLong() {
        int64_t hi = (int64_t)next(32);
        int64_t lo = (int64_t)next(32);
        return (hi << 32) + lo;
    }
};

static std::vector<uint8_t> RanDomKey(const uint8_t head[8]) {
    int64_t s5 = (int8_t)head[5];
    JavaRandom rHead5(s5);
    int32_t n5 = rHead5.nextInt(127);
    if (n5 == 0) n5 = 1;
    int64_t ks = 3680984568597093857LL / (int64_t)n5;

    JavaRandom random(ks);
    int t = (int8_t)head[0];
    for (int i = 0; i < t; ++i) {
        random.nextLong();
    }
    int64_t n = random.nextLong();
    JavaRandom r2(n);

    int64_t ld[8] = {
        (int8_t)head[4],
        r2.nextLong(),
        (int8_t)head[7],
        (int8_t)head[3],
        r2.nextLong(),
        (int8_t)head[1],
        random.nextLong(),
        (int8_t)head[2]
    };

    std::vector<uint8_t> res(64);
    for (int i = 0; i < 8; ++i) {
        uint64_t v = (uint64_t)ld[i];
        for (int b = 7; b >= 0; --b) {
            res[i * 8 + (7 - b)] = (uint8_t)((v >> (b * 8)) & 0xFF);
        }
    }
    return res;
}
} // namespace

#pragma warning(push)
#pragma warning(disable: 4996)
std::string DecryptFinalShellPassword(const std::string& encPass) {
    if (encPass.empty()) return "";
    std::string decodedStr = Base64Decode(encPass);
    if (decodedStr.size() < 16) return "";

    const uint8_t* data = reinterpret_cast<const uint8_t*>(decodedStr.data());
    size_t totalLen = decodedStr.size();

    uint8_t head[8];
    memcpy(head, data, 8);

    size_t bodyLen = totalLen - 8;
    if (bodyLen % 8 != 0) return "";
    const uint8_t* body = data + 8;

    std::vector<uint8_t> keyBytes = RanDomKey(head);
    unsigned char md5Hash[MD5_DIGEST_LENGTH];
    MD5(keyBytes.data(), keyBytes.size(), md5Hash);

    DES_cblock desKey;
    memcpy(&desKey, md5Hash, 8);
    DES_key_schedule schedule;
    DES_set_key_unchecked(&desKey, &schedule);

    std::vector<uint8_t> decrypted(bodyLen);
    for (size_t i = 0; i < bodyLen; i += 8) {
        DES_ecb_encrypt((const_DES_cblock*)(body + i), (DES_cblock*)(decrypted.data() + i), &schedule, DES_DECRYPT);
    }

    if (decrypted.empty()) return "";
    uint8_t pad = decrypted.back();
    if (pad > 8 || pad == 0) return "";
    for (size_t i = decrypted.size() - pad; i < decrypted.size(); ++i) {
        if (decrypted[i] != pad) return "";
    }
    decrypted.resize(decrypted.size() - pad);

    return std::string((char*)decrypted.data(), decrypted.size());
}

