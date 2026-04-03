import * as functions from 'firebase-functions/v1';
import * as admin from 'firebase-admin';
import * as os from 'os';
import * as path from 'path';
import * as fs from 'fs';
import ffmpeg from 'fluent-ffmpeg';
import ffmpegInstaller from '@ffmpeg-installer/ffmpeg';
import ffprobeInstaller from '@ffprobe-installer/ffprobe';

// Set up ffmpeg and ffprobe paths
ffmpeg.setFfmpegPath(ffmpegInstaller.path);
ffmpeg.setFfprobePath(ffprobeInstaller.path);

export const processMovUpload = functions
  .runWith({ timeoutSeconds: 540, memory: '2GB' })
  .storage
  .object()
  .onFinalize(async (object) => {
    const filePath = object.name;

    if (!filePath) {
      console.log('No file path present');
      return;
    }

    // 2. Check if the uploaded file is a .mov file.
    if (!filePath.toLowerCase().endsWith('.mov')) {
      console.log(`File is not a .mov: ${filePath}`);
      return;
    }

    // Skip if it's already in the converted folder to prevent loops
    if (filePath.startsWith('converted/')) {
        console.log(`File is already in converted folder: ${filePath}`);
        return;
    }

    const fileNameElement = path.basename(filePath);
    const fileNameWithoutExt = path.parse(fileNameElement).name;
    const bucket = admin.storage().bucket(object.bucket);
    
    // We assume the videoId is passed in metadata, or we default to the filename.
    const videoId = object.metadata?.videoId || fileNameWithoutExt;

    const db = admin.firestore();
    const videoDocRef = db.collection('videos').doc(videoId);

    try {
      // 9. Update the database with video status = processing
      await videoDocRef.set({ status: 'processing' }, { merge: true }).catch(err => {
        console.warn(`Failed to update status to processing for ${videoId}:`, err);
      });

      const tempDir = os.tmpdir();
      const localInputPath = path.join(tempDir, `input_${fileNameElement}`);
      const localOutputPath = path.join(tempDir, `${fileNameWithoutExt}.mp4`);

      console.log(`Downloading ${filePath} to ${localInputPath}`);
      await bucket.file(filePath).download({ destination: localInputPath });

      // 4. Before converting, check the video codec using ffprobe.
      console.log(`Probing codec for ${localInputPath}`);
      const probeData = await new Promise<any>((resolve, reject) => {
        ffmpeg.ffprobe(localInputPath, (err, metadata) => {
          if (err) reject(err);
          else resolve(metadata);
        });
      });

      const videoStream = probeData.streams?.find((s: any) => s.codec_type === 'video');
      const isH264 = videoStream?.codec_name === 'h264';
      console.log(`Video codec is: ${videoStream?.codec_name}. isH264: ${isH264}`);

      console.log(`Starting FFmpeg processing for ${localInputPath}`);
      
      await new Promise<void>((resolve, reject) => {
        let command = ffmpeg(localInputPath);
        
        if (isH264) {
          // 5. If the codec is already H.264, do a fast remux instead of full conversion
          command = command
            .videoCodec('copy')
            .outputOptions(['-movflags +faststart']);
        } else {
          // 6. If the codec is not H.264, convert using specified settings
          command = command
            .videoCodec('libx264')
            .outputOptions([
              '-preset veryfast',
              '-crf 20',
              '-threads 0',
              '-movflags +faststart'
            ])
            .audioCodec('aac');
        }

        command
          .output(localOutputPath)
          .on('error', (err) => {
            console.error('FFmpeg error:', err);
            reject(err);
          })
          .on('end', () => {
            console.log('FFmpeg processing finished');
            resolve();
          })
          .run();
      });

      // 7. Upload the converted MP4 back to Google Cloud Storage in a converted/ folder.
      const destinationPath = `converted/${fileNameWithoutExt}.mp4`;
      console.log(`Uploading converted file to ${destinationPath}`);
      
      await bucket.upload(localOutputPath, {
        destination: destinationPath,
        metadata: {
          contentType: 'video/mp4',
          metadata: {
            originalName: filePath,
            videoId: videoId
          }
        }
      });

      // Keep original MOV file as backup (we just don't delete it from storage)
      // 8. Keep the original MOV file as backup.

      // Get signed URL or just store the path
      const [signedUrl] = await bucket.file(destinationPath).getSignedUrl({
          action: 'read',
          expires: '03-01-2500' // Far future
      });

      console.log(`Updating database for videoId: ${videoId} with status: ready`);
      // 9. Update the database with video status = ready
      await videoDocRef.set({
        status: 'ready',
        videoUrl: signedUrl,
        storagePath: destinationPath,
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
      }, { merge: true });

      // Clean up local temp files
      fs.unlinkSync(localInputPath);
      fs.unlinkSync(localOutputPath);
      console.log(`Process completed successfully for ${filePath}`);
    } catch (error) {
      console.error(`Error processing ${filePath}:`, error);
      await videoDocRef.set({ 
        status: 'error', 
        errorMessage: (error as Error).message || 'Unknown error',
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
      }, { merge: true });
    }
  });
