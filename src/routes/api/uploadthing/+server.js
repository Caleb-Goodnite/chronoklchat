import { createUploadthing, createRouteHandler } from 'uploadthing/server';
import { env } from '$env/dynamic/private';

const dayInMs = 24 * 60 * 60 * 1000;

if (env.UPLOADTHING_SECRET && !process.env.UPLOADTHING_SECRET) {
  process.env.UPLOADTHING_SECRET = env.UPLOADTHING_SECRET;
}

if (env.UPLOADTHING_APP_ID && !process.env.UPLOADTHING_APP_ID) {
  process.env.UPLOADTHING_APP_ID = env.UPLOADTHING_APP_ID;
}

const f = createUploadthing();

const fileRouter = {
  chatImage: f({
    image: {
      maxFileSize: '8MB',
      maxFileCount: 4
    }
  })
    .middleware(async () => ({
      userId: 'anonymous'
    }))
    .onUploadComplete(async ({ file, metadata }) => ({
      file: {
        key: file.key,
        name: file.name,
        size: file.size,
        type: file.type,
        url: file.ufsUrl ?? file.url,
        uploadedAt: Date.now(),
        expiresAt: Date.now() + dayInMs
      },
      metadata
    }))
};

export const { GET, POST } = createRouteHandler({ router: fileRouter });

export const config = {
  runtime: 'nodejs20.x'
};

