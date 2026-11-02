# Gramola para PS4 (OpenOrbis): make → GRAM00001.pkg (fPKG para GoldHEN).
# Necesita el toolchain de OpenOrbis (OO_PS4_TOOLCHAIN) y LLVM con lld (en el Mac: brew install llvm lld).
# La versión de escritorio para desarrollar: ./build-mac.sh

TITLE       := Gramola
VERSION     := 01.00
TITLE_ID    := GRAM00001
CONTENT_ID  := IV0000-GRAM00001_00-GRAMOLAKARAOKE00

TOOLCHAIN   ?= $(OO_PS4_TOOLCHAIN)
LIBS        := -lc -lkernel -lc++ -lpthread -lSceUserService -lSceSysmodule -lSceSystemService -lScePigletv2VSH \
               -lScePrecompiledShaders -lScePad -lSceAudioOut -lSceAudioIn

UNAME_S     := $(shell uname -s)
ifeq ($(UNAME_S),Darwin)
  LLVM      ?= /opt/homebrew/opt/llvm/bin
  LLD       ?= /opt/homebrew/opt/lld/bin
  CDIR      := macos
else
  LLVM      ?= /usr/bin
  LLD       ?= /usr/bin
  CDIR      := linux
endif
CXX         := $(LLVM)/clang++
LD          := $(LLD)/ld.lld
OO          := $(TOOLCHAIN)/bin/$(CDIR)

SRC         := src/main.cpp src/gfx.cpp src/audio.cpp src/pitch.cpp src/song.cpp src/plat_ps4.cpp
OBJ         := $(patsubst src/%.cpp,build/%.o,$(SRC))
CXXFLAGS    := --target=x86_64-pc-freebsd12-elf -fPIC -funwind-tables -O2 -std=gnu++17 -D_GNU_SOURCE -DGRAMOLA_PS4 \
               -isysroot $(TOOLCHAIN) -isystem $(TOOLCHAIN)/include -isystem $(TOOLCHAIN)/include/c++/v1
LDFLAGS     := -m elf_x86_64 -pie --script $(TOOLCHAIN)/link.x --eh-frame-hdr -L$(TOOLCHAIN)/lib $(LIBS) $(TOOLCHAIN)/lib/crt1.o
AUTHINFO    := 000000000000000000000000001C004000FF000000000080000000000000000000000000000000000000008000400040000000000000008000000000000000080040FFFF000000F000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000

ASSETS      := $(shell find assets -type f ! -name '.*')
MODULES     := sce_module/libc.prx sce_module/libSceFios2.prx

all: $(CONTENT_ID).pkg

$(CONTENT_ID).pkg: pkg.gp4
	$(OO)/PkgTool.Core pkg_build $< .

pkg.gp4: eboot.bin sce_sys/about/right.sprx sce_sys/param.sfo sce_sys/icon0.png $(MODULES) $(ASSETS)
	$(OO)/create-gp4 -out $@ --content-id=$(CONTENT_ID) --files "$^"

# Módulos y right.sprx: los del ejemplo de OpenOrbis
sce_module/%.prx:
	@mkdir -p sce_module && cp $(TOOLCHAIN)/samples/piglet/sce_module/$*.prx $@
sce_sys/about/right.sprx:
	@mkdir -p sce_sys/about && cp $(TOOLCHAIN)/samples/piglet/sce_sys/about/right.sprx $@
sce_sys/icon0.png: icono.png
	@mkdir -p sce_sys && cp $< $@

sce_sys/param.sfo: Makefile
	@mkdir -p sce_sys
	$(OO)/PkgTool.Core sfo_new $@
	$(OO)/PkgTool.Core sfo_setentry $@ APP_TYPE --type Integer --maxsize 4 --value 1
	$(OO)/PkgTool.Core sfo_setentry $@ APP_VER --type Utf8 --maxsize 8 --value '$(VERSION)'
	$(OO)/PkgTool.Core sfo_setentry $@ ATTRIBUTE --type Integer --maxsize 18 --value 0
	$(OO)/PkgTool.Core sfo_setentry $@ CATEGORY --type Utf8 --maxsize 4 --value 'gde'
	$(OO)/PkgTool.Core sfo_setentry $@ FORMAT --type Utf8 --maxsize 4 --value 'obs'
	$(OO)/PkgTool.Core sfo_setentry $@ CONTENT_ID --type Utf8 --maxsize 48 --value '$(CONTENT_ID)'
	$(OO)/PkgTool.Core sfo_setentry $@ DOWNLOAD_DATA_SIZE --type Integer --maxsize 4 --value 0
	$(OO)/PkgTool.Core sfo_setentry $@ SYSTEM_VER --type Integer --maxsize 4 --value 1020
	$(OO)/PkgTool.Core sfo_setentry $@ TITLE --type Utf8 --maxsize 128 --value '$(TITLE)'
	$(OO)/PkgTool.Core sfo_setentry $@ TITLE_ID --type Utf8 --maxsize 12 --value '$(TITLE_ID)'
	$(OO)/PkgTool.Core sfo_setentry $@ VERSION --type Utf8 --maxsize 8 --value '$(VERSION)'

eboot.bin: $(OBJ)
	$(LD) $(OBJ) -o build/gramola.elf $(LDFLAGS)
	$(OO)/create-fself -in=build/gramola.elf -out=build/gramola.oelf --eboot "eboot.bin" --paid 0x3800000000000035 --authinfo $(AUTHINFO)

build/%.o: src/%.cpp src/*.h
	@mkdir -p build
	$(CXX) $(CXXFLAGS) -c -o $@ $<

clean:
	rm -rf build eboot.bin pkg.gp4 sce_sys sce_module $(CONTENT_ID).pkg

.PHONY: all clean
