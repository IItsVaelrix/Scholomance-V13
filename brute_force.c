#include <stdio.h>
#include <string.h>
#include <stdint.h>
#include <stdlib.h>

uint32_t fnv1a32(const uint8_t *data, size_t len, uint32_t start_hash) {
    uint32_t h = start_hash;
    for (size_t i = 0; i < len; i++) {
        h ^= data[i];
        h *= 16777619;
    }
    return h;
}

int main(int argc, char **argv) {
    // Generate the exact prefix string
    // To do this, I'll invoke node and tell it to output the prefix string.
    FILE *fp = fopen("prefix.txt", "rb");
    if (!fp) {
        printf("prefix.txt not found\n");
        return 1;
    }

    fseek(fp, 0, SEEK_END);
    long size = ftell(fp);
    fseek(fp, 0, SEEK_SET);

    uint8_t *prefix = malloc(size);
    fread(prefix, 1, size, fp);
    fclose(fp);

    uint32_t h_prefix = fnv1a32(prefix, size, 2166136261U);
    free(prefix);

    uint32_t target = 0xFB961601;

    char suffix[64];
    for (uint32_t nonce = 0; nonce < 0xFFFFFFFF; nonce++) {
        int len = snprintf(suffix, sizeof(suffix), "%u}", nonce);
        uint32_t h = fnv1a32((const uint8_t*)suffix, len, h_prefix);
        if (h == target) {
            printf("Found nonce: %u\n", nonce);
            return 0;
        }
        if (nonce % 50000000 == 0) {
            printf("Checked %u\n", nonce);
        }
    }

    return 0;
}
