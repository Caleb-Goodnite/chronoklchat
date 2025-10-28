import { onMount } from 'svelte';
import { derived, readonly, writable, type Readable } from 'svelte/store';

import {
  INTERNAL_DO_NOT_USE__fatalClientError,
  resolveMaybeUrlArg,
  roundProgress,
  unwrap,
  UploadAbortedError,
  UploadThingError,
  type ExpandedRouteConfig,
  type FetchEsque
} from '@uploadthing/shared';
import { genUploader } from 'uploadthing/client';
import type { FileRouter } from 'uploadthing/server';
import type { EndpointArg, inferEndpointInput } from 'uploadthing/types';
import type {
  GenerateTypedHelpersOptions,
  UploadthingComponentProps,
  UseUploadthingProps
} from '@uploadthing/svelte';

type UploadThingRouteConfig = ExpandedRouteConfig | undefined;

type FetchStoreData = {
  type: 'loading' | 'fetched' | 'error';
  data?: unknown;
  error?: unknown;
};

const createFetch = (fetchFn: FetchEsque, url: string | undefined, options?: RequestInit) => {
  const cache: Record<string, unknown> = {};
  const initialState: FetchStoreData = {
    type: 'loading'
  };
  const store = writable<FetchStoreData>(initialState);

  const fetchData = async () => {
    if (!url) {
      store.set({
        type: 'error',
        error: new Error('No URL provided')
      });
      return;
    }

    if (cache[url]) {
      store.set({ type: 'fetched', data: cache[url] });
      return;
    }

    try {
      const response = await fetchFn(url, options);
      if (!response.ok) {
        throw new Error(response.statusText);
      }
      const payload = await response.json();
      cache[url] = payload;
      store.set({ type: 'fetched', data: payload });
    } catch (error) {
      store.set({ type: 'error', error });
    }
  };

  onMount(() => {
    void fetchData();
  });

  return readonly(store);
};

const createRouteConfig = <TRouter extends FileRouter, TEndpoint extends keyof TRouter>(
  fetchFn: FetchEsque,
  url: URL,
  endpoint: EndpointArg<TRouter, TEndpoint>
) => {
  const dataGetter = createFetch(fetchFn, url.href);
  return derived(dataGetter, ($data) =>
    ($data.data as { data?: Array<{ slug: string; config: UploadThingRouteConfig }> } | undefined)?.data?.find(
      (entry) => entry.slug === endpoint
    )?.config
  );
};

export function __createUploadThingInternal<TRouter extends FileRouter, TEndpoint extends keyof TRouter>(
  url: URL,
  endpoint: EndpointArg<TRouter, TEndpoint>,
  fetch: FetchEsque,
  opts?: UseUploadthingProps<TRouter[TEndpoint]>
) {
  const progressGranularity = opts?.uploadProgressGranularity ?? 'coarse';
  const { uploadFiles, routeRegistry } = genUploader<TRouter>({
    fetch,
    url,
    package: '@uploadthing/svelte'
  });

  const isUploading = writable(false);
  let uploadProgress = 0;
  let fileProgress = new Map<File, number>();

  const startUpload = async (
    ...args: undefined extends inferEndpointInput<TRouter[TEndpoint]>
      ? [files: File[], input?: inferEndpointInput<TRouter[TEndpoint]>]
      : [files: File[], input: inferEndpointInput<TRouter[TEndpoint]>]
  ) => {
    const input = args[1];
    const files = (await opts?.onBeforeUploadBegin?.(args[0])) ?? args[0];

    isUploading.set(true);
    opts?.onUploadProgress?.(0);
    files.forEach((file) => fileProgress.set(file, 0));

    try {
      const result = await uploadFiles(endpoint, {
        signal: opts?.signal,
        headers: opts?.headers,
        files,
        onUploadProgress: (progress) => {
          if (!opts?.onUploadProgress) return;
          fileProgress.set(progress.file, progress.progress);
          let sum = 0;
          fileProgress.forEach((value) => {
            sum += value;
          });
          const averageProgress = roundProgress(
            Math.min(100, sum / fileProgress.size),
            progressGranularity
          );
          if (averageProgress !== uploadProgress) {
            opts.onUploadProgress(averageProgress);
            uploadProgress = averageProgress;
          }
        },
        onUploadBegin: ({ file }) => {
          if (!opts?.onUploadBegin) return;
          opts.onUploadBegin(file);
        },
        // @ts-expect-error - input may not be defined on the type
        input
      });
      await opts?.onClientUploadComplete?.(result);
      return result;
    } catch (error) {
      if (error instanceof UploadAbortedError) {
        throw error;
      }

      let wrappedError: UploadThingError | ReturnType<typeof INTERNAL_DO_NOT_USE__fatalClientError>;
      if (error instanceof UploadThingError) {
        wrappedError = error;
      } else {
        wrappedError = INTERNAL_DO_NOT_USE__fatalClientError(error);
        console.error(
          'Something went wrong. Please contact UploadThing and provide the following cause:',
          wrappedError.cause instanceof Error ? wrappedError.cause.toString() : wrappedError.cause
        );
      }

      await opts?.onUploadError?.(wrappedError);
    } finally {
      isUploading.set(false);
      fileProgress = new Map();
      uploadProgress = 0;
    }
  };
  const resolvedEndpoint = unwrap(endpoint, routeRegistry);
  const routeConfig = createRouteConfig(fetch, url, resolvedEndpoint as string);

  return {
    startUpload,
    isUploading: readonly(isUploading) as Readable<boolean>,
    routeConfig: routeConfig as Readable<UploadThingRouteConfig>,
    /** @deprecated Use `routeConfig` instead */
    permittedFileInfo: { slug: resolvedEndpoint, config: readonly(routeConfig) }
  } as const;
}

const generateUploader = () => {
  return <TRouter extends FileRouter, TEndpoint extends keyof TRouter>(
    endpoint: EndpointArg<TRouter, TEndpoint>,
    props: Omit<UploadthingComponentProps<TRouter, TEndpoint>, 'endpoint'>
  ) => ({ endpoint, ...props });
};

export const generateSvelteHelpers = <TRouter extends FileRouter>(
  initOpts?: GenerateTypedHelpersOptions
) => {
  const url = resolveMaybeUrlArg(initOpts?.url);
  const fetch = initOpts?.fetch ?? globalThis.fetch;
  const clientHelpers = genUploader<TRouter>({
    fetch,
    url,
    package: '@uploadthing/svelte'
  });

  const createUploadThing = <TEndpoint extends keyof TRouter>(
    endpoint: EndpointArg<TRouter, TEndpoint>,
    props: UseUploadthingProps<TRouter[TEndpoint]>
  ) => {
    return __createUploadThingInternal(url, endpoint, fetch, props);
  };

  const createUploader = generateUploader();

  return {
    ...clientHelpers,
    createUploadThing,
    createUploader
  };
};

