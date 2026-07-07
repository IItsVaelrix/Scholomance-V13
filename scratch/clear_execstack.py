import mmap
import struct
import sys

def clear_execstack(filepath):
    with open(filepath, "r+b") as f:
        mm = mmap.mmap(f.fileno(), 0)
        
        # Check ELF magic
        if mm[:4] != b"\x7fELF":
            print("Not an ELF file")
            return
            
        is_64 = mm[4] == 2
        
        # E_PHOFF offset
        phoff = struct.unpack_from("<Q" if is_64 else "<I", mm, 32 if is_64 else 28)[0]
        # E_PHNUM (number of program headers)
        phnum = struct.unpack_from("<H", mm, 56 if is_64 else 44)[0]
        # E_PHENTSIZE (size of each program header)
        phentsize = struct.unpack_from("<H", mm, 54 if is_64 else 42)[0]
        
        for i in range(phnum):
            ph_offset = phoff + i * phentsize
            p_type = struct.unpack_from("<I", mm, ph_offset)[0]
            if p_type == 0x6474e551:  # PT_GNU_STACK
                p_flags_offset = ph_offset + (4 if is_64 else 24)
                p_flags = struct.unpack_from("<I", mm, p_flags_offset)[0]
                
                print(f"Found PT_GNU_STACK with flags {p_flags:#x}")
                if p_flags & 1:  # PF_X (Executable)
                    print("Stack is executable! Clearing PF_X flag...")
                    new_flags = p_flags & ~1
                    struct.pack_into("<I", mm, p_flags_offset, new_flags)
                    print("Flag cleared.")
                else:
                    print("Stack is already non-executable.")
                break
        
        mm.flush()
        mm.close()

if __name__ == '__main__':
    clear_execstack(sys.argv[1])
