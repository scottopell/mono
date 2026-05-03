#define _GNU_SOURCE
#include <stdio.h>
#include <stdlib.h>
#include <dlfcn.h>
#include <pthread.h>
#include <stdatomic.h>

// Function pointers to real malloc/free
static void* (*real_malloc)(size_t) = NULL;
static void (*real_free)(void*) = NULL;
static void* (*real_calloc)(size_t, size_t) = NULL;
static void* (*real_realloc)(void*, size_t) = NULL;

// Thread-safe counters
static atomic_ulong total_mallocs = 0;
static atomic_ulong total_frees = 0;
static atomic_ulong live_allocations = 0;

// Initialize real functions
static void init(void) {
    if (real_malloc) return;

    real_malloc = dlsym(RTLD_NEXT, "malloc");
    real_free = dlsym(RTLD_NEXT, "free");
    real_calloc = dlsym(RTLD_NEXT, "calloc");
    real_realloc = dlsym(RTLD_NEXT, "realloc");

    if (!real_malloc || !real_free || !real_calloc || !real_realloc) {
        fprintf(stderr, "MALLOC_LOGGER: Failed to load real functions\n");
        exit(1);
    }
}

void* malloc(size_t size) {
    init();

    void* ptr = real_malloc(size);

    // Log allocation size to stderr
    fprintf(stderr, "MALLOC_SIZE,%zu\n", size);

    // Update counters
    atomic_fetch_add(&total_mallocs, 1);
    atomic_fetch_add(&live_allocations, 1);

    return ptr;
}

void free(void* ptr) {
    init();

    if (ptr) {
        atomic_fetch_add(&total_frees, 1);
        atomic_fetch_sub(&live_allocations, 1);
    }

    real_free(ptr);
}

void* calloc(size_t nmemb, size_t size) {
    init();

    void* ptr = real_calloc(nmemb, size);

    // Log as single allocation
    fprintf(stderr, "MALLOC_SIZE,%zu\n", nmemb * size);

    atomic_fetch_add(&total_mallocs, 1);
    atomic_fetch_add(&live_allocations, 1);

    return ptr;
}

void* realloc(void* ptr, size_t size) {
    init();

    void* new_ptr = real_realloc(ptr, size);

    // Log realloc as new allocation
    fprintf(stderr, "MALLOC_SIZE,%zu\n", size);

    // If ptr was NULL, this is like malloc
    if (!ptr) {
        atomic_fetch_add(&total_mallocs, 1);
        atomic_fetch_add(&live_allocations, 1);
    }

    return new_ptr;
}

// Print summary on exit
__attribute__((destructor))
static void print_summary(void) {
    unsigned long mallocs = atomic_load(&total_mallocs);
    unsigned long frees = atomic_load(&total_frees);
    unsigned long live = atomic_load(&live_allocations);

    fprintf(stderr, "\n=== MALLOC LOGGER SUMMARY ===\n");
    fprintf(stderr, "Total malloc calls: %lu\n", mallocs);
    fprintf(stderr, "Total free calls: %lu\n", frees);
    fprintf(stderr, "Live allocations at exit: %lu\n", live);
    fprintf(stderr, "============================\n");
}
