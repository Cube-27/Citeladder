import { useEffect, useState } from 'react';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { FREE_TOOL_LIMITS } from '@/lib/config/free-tools';
import { socialTags } from '@/lib/free-tools/generators';
import { ToolForm, ToolInput } from './tool-form';

export function SocialPreview() {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [url, setUrl] = useState('');
  const [image, setImage] = useState('');
  const [alt, setAlt] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [localImage, setLocalImage] = useState('');
  const [error, setError] = useState('');
  useEffect(() => {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') setLocalImage(reader.result);
    };
    reader.onerror = () => {
      setLocalImage('');
      setError('Could not read that image.');
    };
    reader.readAsDataURL(file);
    return () => reader.abort();
  }, [file]);
  const preview = (
    <div className="bg-panel border-border-subtle overflow-hidden rounded-[var(--radius-card)] border">
      {file && localImage ? (
        <img
          src={localImage}
          alt={alt || 'Locally selected preview'}
          className="aspect-[1.91/1] w-full object-cover"
          onError={() => {
            setFile(null);
            setLocalImage('');
            setError('This image could not be decoded. Choose another PNG, JPEG or WebP.');
          }}
        />
      ) : (
        <div className="bg-canvas-soft text-muted website-body flex aspect-[1.91/1] items-center justify-center p-6 text-center">
          Select a local image to preview its crop
        </div>
      )}
      <div className="flex flex-col gap-2 p-5">
        <p className="website-label text-muted truncate">{url || 'https://example.com'}</p>
        <h3 className="website-feature-heading break-words">{title || 'Your page title'}</h3>
        <p className="website-body text-muted break-words">
          {description || 'Your page description appears here.'}
        </p>
      </div>
    </div>
  );
  return (
    <ToolForm
      action="Generate social tags"
      filename="social-tags.html"
      preview={preview}
      signature={JSON.stringify([title, description, url, image, alt])}
      run={() => socialTags(title, description, url, image, alt)}
      sample={() => {
        setTitle('Make your next page easier to discover');
        setDescription(
          'A practical guide to crawler access, page directives and clear website evidence.',
        );
        setUrl('https://example.com/guide');
        setImage('https://example.com/share.jpg');
        setAlt('A guide to website discovery');
        setFile(null);
        setLocalImage('');
        setError('');
      }}
    >
      <ToolInput label="Title" value={title} onChange={setTitle} />
      <ToolInput label="Description" value={description} onChange={setDescription} />
      <ToolInput label="Page URL" value={url} onChange={setUrl} />
      <ToolInput
        label="Published image URL (optional)"
        hint="Used in generated tags only. This URL is not fetched."
        value={image}
        onChange={setImage}
      />
      <ToolInput label="Image description" value={alt} onChange={setAlt} />
      <Field
        label="Local preview image (optional)"
        hint="PNG, JPEG or WebP, up to 5 MB. Stays on your device; publish it separately at your image URL."
        error={error}
      >
        {(props) => (
          <Input
            {...props}
            type="file"
            accept="image/png,image/jpeg,image/webp"
            onChange={(event) => {
              const next = event.target.files?.[0];
              event.target.value = '';
              if (!next) return;
              if (
                !['image/png', 'image/jpeg', 'image/webp'].includes(next.type) ||
                next.size > FREE_TOOL_LIMITS.imageBytes
              ) {
                setError('Choose a PNG, JPEG or WebP smaller than 5 MB.');
                setFile(null);
                return;
              }
              setFile(next);
              setLocalImage('');
              setError('');
            }}
          />
        )}
      </Field>
    </ToolForm>
  );
}
