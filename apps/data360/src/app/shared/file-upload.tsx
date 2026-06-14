'use client';

import React, { useRef, useState } from 'react';
import Image from 'next/image';
import {
  PiArrowLineDownBold,
  PiFile,
  PiFileCsv,
  PiFileDoc,
  PiFilePdf,
  PiFileXls,
  PiFileZip,
  PiTrashBold,
  PiWarningCircleBold,
  PiXBold,
} from 'react-icons/pi';
import { ActionIcon, Title, Text, Button } from 'rizzui';
import cn from '@core/utils/class-names';
import Upload from '@core/ui/upload';
import { useModal } from '@/app/shared/modal-views/use-modal';
import SimpleBar from '@core/ui/simplebar';
import { toast } from 'react-hot-toast';
import { getApiErrorMessage } from '@/lib/api-client';

type AcceptedFiles = 'img' | 'pdf' | 'csv' | 'imgAndPdf' | 'all';

/**
 * Real upload handler. When a caller provides `onUpload`, this component performs
 * an actual upload through it (the caller owns the endpoint/service call) and
 * reports the true success/error. When it is omitted, the component HONESTLY
 * disables the action ("Bulk import isn't available yet") instead of faking a
 * success — silently dropping the file is the bug we are removing. Callers that
 * gain a real bulk-import endpoint can pass `onUpload` to light the flow up.
 */
export type FileUploadHandler = (files: Array<File>) => Promise<void>;

export default function FileUpload({
  label = 'Upload Files',
  btnLabel = 'Upload',
  fieldLabel,
  multiple = true,
  accept = 'all',
  onUpload,
  onSuccess,
}: {
  label?: string;
  fieldLabel?: string;
  btnLabel?: string;
  multiple?: boolean;
  accept?: AcceptedFiles;
  onUpload?: FileUploadHandler;
  onSuccess?: () => void;
}) {
  const { closeModal } = useModal();

  return (
    <div className="m-auto px-5 pb-8 pt-5 @lg:pt-6 @2xl:px-7">
      <div className="mb-6 flex items-center justify-between">
        <Title as="h3" className="text-lg">
          {label}
        </Title>
        <ActionIcon
          size="sm"
          variant="text"
          onClick={() => closeModal()}
          className="p-0 text-gray-500 hover:!text-gray-900"
        >
          <PiXBold className="h-[18px] w-[18px]" />
        </ActionIcon>
      </div>

      <FileInput
        accept={accept}
        multiple={multiple}
        label={fieldLabel}
        btnLabel={btnLabel}
        onUpload={onUpload}
        onSuccess={onSuccess}
      />
    </div>
  );
}

const fileType = {
  'text/csv': <PiFileCsv className="h-5 w-5" />,
  'text/plain': <PiFile className="h-5 w-5" />,
  'application/pdf': <PiFilePdf className="h-5 w-5" />,
  'application/xml': <PiFileXls className="h-5 w-5" />,
  'application/zip': <PiFileZip className="h-5 w-5" />,
  'application/gzip': <PiFileZip className="h-5 w-5" />,
  'application/msword': <PiFileDoc className="h-5 w-5" />,
} as { [key: string]: React.ReactElement };

export const FileInput = ({
  label,
  btnLabel = 'Upload',
  multiple = true,
  accept = 'img',
  className,
  onUpload,
  onSuccess,
}: {
  className?: string;
  label?: React.ReactNode;
  multiple?: boolean;
  btnLabel?: string;
  accept?: AcceptedFiles;
  onUpload?: FileUploadHandler;
  onSuccess?: () => void;
}) => {
  const { closeModal } = useModal();
  const [files, setFiles] = useState<Array<File>>([]);
  const [uploading, setUploading] = useState(false);
  const imageRef = useRef<HTMLInputElement>(null);

  // Honest gate: without a real upload handler there is no backend to receive the
  // file. We must NOT pretend it worked — show a clear "not available" state.
  const importAvailable = typeof onUpload === 'function';

  function handleFileDrop(event: React.ChangeEvent<HTMLInputElement>) {
    const uploadedFiles = (event.target as HTMLInputElement).files;
    const newFiles = Object.entries(uploadedFiles as object)
      .map((file) => {
        if (file[1]) return file[1];
      })
      .filter((file) => file !== undefined);
    setFiles((prevFiles) => [...prevFiles, ...newFiles]);
  }

  function handleImageDelete(index: number) {
    const updatedFiles = files.filter((_, i) => i !== index);
    setFiles(updatedFiles);
    (imageRef.current as HTMLInputElement).value = '';
  }

  async function handleFileUpload() {
    if (!importAvailable || !onUpload) return; // guarded — button is disabled anyway
    if (!files.length) {
      toast.error(<Text as="b">Please drop your file</Text>);
      return;
    }
    setUploading(true);
    try {
      await onUpload(files);
      toast.success(
        <Text as="b">{files.length > 1 ? `${files.length} files imported` : 'File imported'}</Text>
      );
      setFiles([]);
      onSuccess?.();
      setTimeout(() => {
        closeModal();
      }, 200);
    } catch (error) {
      toast.error(<Text as="b">{getApiErrorMessage(error)}</Text>);
    } finally {
      setUploading(false);
    }
  }

  // No real endpoint wired → present an honest, disabled state instead of a
  // dropzone that would silently discard the file.
  if (!importAvailable) {
    return (
      <div className={className}>
        <div className="flex flex-col items-center rounded-xl border border-dashed border-amber-300 bg-amber-50/60 px-5 py-8 text-center dark:border-amber-700/60 dark:bg-amber-900/15">
          <PiWarningCircleBold className="mb-2 h-7 w-7 text-amber-500" />
          <Text as="b" className="text-amber-800 dark:text-amber-300">
            Bulk import isn’t available yet
          </Text>
          <Text className="mt-1 max-w-sm text-sm text-amber-700/90 dark:text-amber-300/80">
            This backend doesn’t expose a bulk-import endpoint for this list. Add
            entries individually from the table for now.
          </Text>
        </div>
        <div className="mt-4 flex justify-end">
          <Button
            className="w-full"
            disabled
            title="Import isn’t available on this backend yet"
          >
            <PiArrowLineDownBold className="me-1.5 h-[17px] w-[17px]" />
            {btnLabel}
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className={className}>
      <Upload
        label={label}
        ref={imageRef}
        accept={accept}
        multiple={multiple}
        onChange={(event) => handleFileDrop(event)}
        className="mb-6 min-h-[280px] justify-center border-dashed bg-gray-50 dark:bg-transparent"
      />

      {files.length > 1 ? (
        <Text className="mb-2 text-gray-500">{files.length} files</Text>
      ) : null}

      {files.length > 0 && (
        <SimpleBar className="max-h-[280px]">
          <div className="grid grid-cols-1 gap-4">
            {files?.map((file: File, index: number) => (
              <div
                className="flex min-h-[58px] w-full items-center rounded-xl border border-muted px-3 dark:border-gray-300"
                key={file.name}
              >
                <div className="relative flex h-10 w-10 flex-shrink-0 items-center justify-center overflow-hidden rounded-lg border border-muted bg-gray-50 object-cover px-2 py-1.5 dark:bg-transparent">
                  {file.type.includes('image') ? (
                    <Image
                      src={URL.createObjectURL(file)}
                      fill
                      className="object-contain"
                      priority
                      alt={file.name}
                      sizes="(max-width: 768px) 100vw"
                    />
                  ) : (
                    <>{fileType[file.type]}</>
                  )}
                </div>
                <div className="truncate px-2.5">{file.name}</div>
                <ActionIcon
                  onClick={() => handleImageDelete(index)}
                  size="sm"
                  variant="flat"
                  color="danger"
                  className="ms-auto flex-shrink-0 p-0 dark:bg-red-dark/20"
                >
                  <PiTrashBold className="w-6" />
                </ActionIcon>
              </div>
            ))}
          </div>
        </SimpleBar>
      )}
      <div className="mt-4 flex justify-end gap-3">
        <Button
          variant="outline"
          className={cn(!files.length && 'hidden', 'w-full')}
          onClick={() => setFiles([])}
          disabled={uploading}
        >
          Reset
        </Button>
        <Button
          className="w-full"
          onClick={() => handleFileUpload()}
          isLoading={uploading}
          aria-busy={uploading}
          disabled={uploading || !files.length}
        >
          <PiArrowLineDownBold className="me-1.5 h-[17px] w-[17px]" />
          {btnLabel}
        </Button>
      </div>
    </div>
  );
};
