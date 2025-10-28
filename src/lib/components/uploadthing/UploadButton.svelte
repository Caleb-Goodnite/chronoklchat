<script lang="ts" context="module">
  import type { FileRouter } from 'uploadthing/server';

  type TRouter = FileRouter;
  type TEndpoint = keyof TRouter;
</script>

<script lang="ts" generics="TRouter extends FileRouter , TEndpoint extends keyof TRouter">
  import { onMount } from 'svelte';

  import type { StyleField } from '@uploadthing/shared';
  import {
    allowedContentTextLabelGenerator,
    defaultClassListMerger,
    resolveMaybeUrlArg,
    styleFieldToClassName,
    styleFieldToCssObject,
    UploadAbortedError
  } from '@uploadthing/shared';
  import {
    generateMimeTypes,
    generatePermittedFileTypes
  } from 'uploadthing/client';

  import { __createUploadThingInternal } from '$lib/vendor/uploadthing/createUploadThing';
  import type { UploadthingComponentProps } from '@uploadthing/svelte';
  import Cancel from '$lib/components/uploadthing/Cancel.svelte';
  import { getFilesFromClipboardEvent } from '$lib/components/uploadthing/shared';
  import Spinner from '$lib/components/uploadthing/Spinner.svelte';

  type ButtonStyleFieldCallbackArgs = {
    __runtime: 'svelte';
    ready: boolean;
    isUploading: boolean;
    uploadProgress: number;
    fileTypes: string[];
    files: File[];
  };

  type UploadButtonAppearance = {
    container?: StyleField<ButtonStyleFieldCallbackArgs>;
    button?: StyleField<ButtonStyleFieldCallbackArgs>;
    allowedContent?: StyleField<ButtonStyleFieldCallbackArgs>;
    clearBtn?: StyleField<ButtonStyleFieldCallbackArgs>;
  };

  export let uploader: UploadthingComponentProps<TRouter, TEndpoint>;
  export let appearance: UploadButtonAppearance = {};
  export let onChange: ((files: File[]) => void) | undefined = undefined;
  export let disabled = false;

  $: ({ mode = 'auto', appendOnPaste = false, cn = defaultClassListMerger } = uploader.config ?? {});
  let acRef = new AbortController();

  let fileInputRef: HTMLInputElement;
  let uploadProgress = 0;
  let files: File[] = [];

  const { startUpload, isUploading, routeConfig } = __createUploadThingInternal(
    resolveMaybeUrlArg(uploader.url),
    uploader.endpoint,
    uploader.fetch ?? globalThis.fetch,
    {
      signal: acRef.signal,
      headers: uploader.headers,
      onClientUploadComplete: (res) => {
        fileInputRef.value = '';
        files = [];
        void uploader.onClientUploadComplete?.(res);
        uploadProgress = 0;
      },
      uploadProgressGranularity: uploader.uploadProgressGranularity,
      onUploadProgress: (p) => {
        uploadProgress = p;
        uploader.onUploadProgress?.(p);
      },
      onUploadError: uploader.onUploadError,
      onUploadBegin: uploader.onUploadBegin,
      onBeforeUploadBegin: uploader.onBeforeUploadBegin
    }
  );

  const uploadFiles = (nextFiles: File[]) => {
    const input = 'input' in uploader ? uploader.input : undefined;
    startUpload(nextFiles, input).catch((e) => {
      if (e instanceof UploadAbortedError) {
        void uploader.onUploadAborted?.();
      } else {
        throw e;
      }
    });
  };

  $: ({ fileTypes, multiple } = generatePermittedFileTypes($routeConfig));
  $: className = ($$props.class as string) ?? '';

  $: state = (() => {
    if (disabled) return 'disabled';
    if (!disabled && !$isUploading) return 'ready';
    return 'uploading';
  })();

  onMount(() => {
    const controller = new AbortController();
    const handlePaste = (event: ClipboardEvent) => {
      if (!appendOnPaste) return;
      if (document.activeElement !== fileInputRef) return;

      const pastedFiles = getFilesFromClipboardEvent(event);
      if (!pastedFiles) return;

      files = [...files, ...pastedFiles];

      onChange?.(files);

      if (mode === 'auto') uploadFiles(files);
    };

    document.addEventListener('paste', handlePaste, {
      signal: controller.signal
    });

    return () => controller.abort();
  });

  $: styleFieldArg = {
    __runtime: 'svelte',
    ready: state !== 'readying',
    isUploading: state === 'uploading',
    uploadProgress,
    fileTypes,
    files
  } satisfies ButtonStyleFieldCallbackArgs;

  $: containerStyle = {
    '--progress-width': `${uploadProgress}%`,
    ...styleFieldToCssObject(appearance?.container, styleFieldArg)
  } as Record<string, string | number>;

  $: buttonStyle = styleFieldToCssObject(appearance?.button, styleFieldArg);
  $: allowedContentStyle = styleFieldToCssObject(appearance?.allowedContent, styleFieldArg);
  $: clearBtnStyle = styleFieldToCssObject(appearance?.clearBtn, styleFieldArg);

  const resetAbortController = () => {
    acRef.abort();
    acRef = new AbortController();
  };
</script>

<div
  class={cn(
    'flex flex-col items-center justify-center gap-1',
    className,
    styleFieldToClassName(appearance?.container, styleFieldArg)
  )}
  style={Object.entries(containerStyle).map(([k,v]) => `${k}:${v}`).join(';')}
  data-state={state}
>
  <!-- svelte-ignore a11y-click-events-have-key-events -->
  <!-- svelte-ignore a11y-no-noninteractive-element-interactions -->
  <label
    class={cn(
      'group relative flex h-10 w-36 cursor-pointer items-center justify-center overflow-hidden rounded-md text-white after:transition-[width] after:duration-500 focus-within:ring-2 focus-within:ring-blue-600 focus-within:ring-offset-2',
      'disabled:pointer-events-none',
      'data-[state=disabled]:cursor-not-allowed data-[state=readying]:cursor-not-allowed',
      'data-[state=disabled]:bg-blue-400 data-[state=ready]:bg-blue-600 data-[state=readying]:bg-blue-400 data-[state=uploading]:bg-blue-400',
      "after:absolute after:left-0 after:h-full after:w-[var(--progress-width)] after:content-[''] data-[state=uploading]:after:bg-blue-600",
      styleFieldToClassName(appearance?.button, styleFieldArg)
    )}
    style={Object.entries(buttonStyle).map(([k,v]) => `${k}:${v}`).join(';')}
    data-state={state}
    data-ut-element="button"
    on:click={(event) => {
      if (state === 'uploading') {
        event.preventDefault();
        event.stopPropagation();
        resetAbortController();
        return;
      }
      if (mode === 'manual' && files.length > 0) {
        event.preventDefault();
        event.stopPropagation();
        uploadFiles(files);
      }
    }}
  >
    <input
      bind:this={fileInputRef}
      class="sr-only"
      type="file"
      accept={generateMimeTypes(fileTypes).join(', ')}
      {disabled}
      {multiple}
      tabindex={fileTypes.length === 0 ? -1 : 0}
      on:change={(event) => {
        if (!event.currentTarget?.files) return;
        const selectedFiles = Array.from(event.currentTarget.files);

        onChange?.(selectedFiles);

        if (mode === 'manual') {
          files = selectedFiles;
          return;
        }

        uploadFiles(selectedFiles);
      }}
    />
    <slot name="button-content" state={styleFieldArg}>
      {#if state === 'readying'}
        {`Loading...`}
      {:else if state === 'uploading'}
        {#if uploadProgress >= 100}
          <Spinner />
        {:else}
          <span class="z-50">
            <span class="block group-hover:hidden">{Math.round(uploadProgress)}%</span>
            <Cancel {cn} className="hidden size-4 group-hover:block" />
          </span>
        {/if}
      {:else if mode === 'manual' && files.length > 0}
        {`Upload ${files.length} file${files.length === 1 ? '' : 's'}`}
      {:else}
        {`Choose File${multiple ? '(s)' : ''}`}
      {/if}
    </slot>
  </label>
  {#if mode === 'manual' && files.length > 0}
    <button
      on:click={() => {
        files = [];
        fileInputRef.value = '';
        onChange?.([]);
      }}
      class={cn(
        'h-[1.25rem] cursor-pointer rounded border-none bg-transparent text-gray-500 transition-colors hover:bg-slate-200 hover:text-gray-600',
        styleFieldToClassName(appearance?.clearBtn, styleFieldArg)
      )}
      style={Object.entries(clearBtnStyle).map(([k,v]) => `${k}:${v}`).join(';')}
      data-state={state}
      data-ut-element="clear-btn"
    >
      <slot name="clear-btn" state={styleFieldArg}>
        {`Clear`}
      </slot>
    </button>
  {:else}
    <div
      class={cn(
        'h-[1.25rem] text-xs leading-5 text-gray-600',
        styleFieldToClassName(appearance?.allowedContent, styleFieldArg)
      )}
      style={Object.entries(allowedContentStyle).map(([k,v]) => `${k}:${v}`).join(';')}
      data-state={state}
      data-ut-element="allowed-content"
    >
      <slot name="allowed-content" state={styleFieldArg}>
        {allowedContentTextLabelGenerator($routeConfig)}
      </slot>
    </div>
  {/if}
</div>

