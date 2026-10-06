package com.omniqa.studio.service;

import com.google.auth.oauth2.GoogleCredentials;
import com.google.cloud.storage.BlobId;
import com.google.cloud.storage.BlobInfo;
import com.google.cloud.storage.Storage;
import com.google.cloud.storage.StorageOptions;
import jakarta.annotation.PostConstruct;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;
import org.springframework.web.multipart.MultipartFile;

import java.io.File;
import java.io.FileInputStream;
import java.io.IOException;
import java.io.InputStream;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.nio.file.StandardCopyOption;
import java.util.UUID;

@Service
public class GoogleCloudStorageService {

    private static final Logger logger = LoggerFactory.getLogger(GoogleCloudStorageService.class);

    @Value("${gcp.storage.bucket-name:omniqa-studio-assets}")
    private String bucketName;

    @Value("${gcp.storage.project-id:omniqa-studio}")
    private String projectId;

    @Value("${gcp.storage.credentials-path:}")
    private String credentialsPath;

    private Storage storage;
    private boolean isGcsAvailable = false;
    private final Path localFallbackDir = Paths.get("uploads");

    @PostConstruct
    public void init() {
        try {
            if (StringUtils.hasText(credentialsPath)) {
                File credentialsFile = new File(credentialsPath);
                if (credentialsFile.exists()) {
                    GoogleCredentials credentials = GoogleCredentials.fromStream(new FileInputStream(credentialsFile));
                    this.storage = StorageOptions.newBuilder()
                            .setProjectId(projectId)
                            .setCredentials(credentials)
                            .build()
                            .getService();
                    this.isGcsAvailable = true;
                    logger.info("Connected to Google Cloud Storage with project [{}] and bucket [{}]", projectId, bucketName);
                    return;
                }
            }

            // Attempt default application credentials
            this.storage = StorageOptions.getDefaultInstance().getService();
            if (this.storage != null && this.storage.get(bucketName) != null) {
                this.isGcsAvailable = true;
                logger.info("Connected to Google Cloud Storage via default credentials");
                return;
            }
        } catch (Exception ex) {
            logger.warn("GCS client initialization note: {}. Initializing local file storage fallback for development.", ex.getMessage());
        }

        // Setup local storage fallback directory
        try {
            Files.createDirectories(localFallbackDir);
            logger.info("Local storage fallback directory initialized at [{}]", localFallbackDir.toAbsolutePath());
        } catch (IOException e) {
            logger.error("Could not create local storage fallback directory: {}", e.getMessage());
        }
    }

    /**
     * Uploads a MultipartFile to GCS (or local fallback) and returns its accessible public URL.
     */
    public String uploadFile(MultipartFile file, String folderPrefix) throws IOException {
        if (file.isEmpty()) {
            throw new IllegalArgumentException("Cannot upload empty file");
        }

        String originalFilename = StringUtils.cleanPath(file.getOriginalFilename() != null ? file.getOriginalFilename() : "file");
        String sanitizedName = originalFilename.replaceAll("[^a-zA-Z0-9._-]", "_");
        String uniqueFileName = UUID.randomUUID() + "_" + sanitizedName;

        String objectPath = StringUtils.hasText(folderPrefix) ? folderPrefix + "/" + uniqueFileName : uniqueFileName;
        String contentType = file.getContentType() != null ? file.getContentType() : "application/octet-stream";

        if (isGcsAvailable && storage != null) {
            try {
                BlobId blobId = BlobId.of(bucketName, objectPath);
                BlobInfo blobInfo = BlobInfo.newBuilder(blobId)
                        .setContentType(contentType)
                        .build();

                storage.create(blobInfo, file.getBytes());
                String publicUrl = String.format("https://storage.googleapis.com/%s/%s", bucketName, objectPath);
                logger.info("File uploaded successfully to GCS: {}", publicUrl);
                return publicUrl;
            } catch (Exception ex) {
                logger.error("GCS upload failed, falling back to local file storage: {}", ex.getMessage());
            }
        }

        // Local fallback storage
        Path destination = localFallbackDir.resolve(uniqueFileName);
        try (InputStream inputStream = file.getInputStream()) {
            Files.copy(inputStream, destination, StandardCopyOption.REPLACE_EXISTING);
        }

        String localUrl = "/api/storage/files/" + uniqueFileName;
        logger.info("File stored in local fallback directory: {}", localUrl);
        return localUrl;
    }

    /**
     * Uploads a MultipartFile with default root prefix.
     */
    public String uploadFile(MultipartFile file) throws IOException {
        return uploadFile(file, "attachments");
    }

    /**
     * Uploads raw byte array to GCS or local fallback.
     */
    public String uploadBytes(byte[] data, String fileName, String contentType, String folderPrefix) throws IOException {
        String objectPath = StringUtils.hasText(folderPrefix) ? folderPrefix + "/" + fileName : fileName;

        if (isGcsAvailable && storage != null) {
            try {
                BlobId blobId = BlobId.of(bucketName, objectPath);
                BlobInfo blobInfo = BlobInfo.newBuilder(blobId)
                        .setContentType(contentType)
                        .build();

                storage.create(blobInfo, data);
                return String.format("https://storage.googleapis.com/%s/%s", bucketName, objectPath);
            } catch (Exception ex) {
                logger.error("GCS uploadBytes failed: {}", ex.getMessage());
            }
        }

        Path destination = localFallbackDir.resolve(fileName);
        Files.write(destination, data);
        return "/api/storage/files/" + fileName;
    }

    /**
     * Deletes a file from GCS or local fallback.
     */
    public boolean deleteFile(String fileUrl) {
        if (!StringUtils.hasText(fileUrl)) {
            return false;
        }

        try {
            if (fileUrl.contains("storage.googleapis.com/" + bucketName + "/")) {
                String objectPath = fileUrl.substring(fileUrl.indexOf(bucketName + "/") + bucketName.length() + 1);
                if (isGcsAvailable && storage != null) {
                    return storage.delete(BlobId.of(bucketName, objectPath));
                }
            } else if (fileUrl.contains("/api/storage/files/")) {
                String fileName = fileUrl.substring(fileUrl.lastIndexOf("/") + 1);
                Path localFile = localFallbackDir.resolve(fileName);
                return Files.deleteIfExists(localFile);
            }
        } catch (Exception ex) {
            logger.warn("Failed to delete file [{}]: {}", fileUrl, ex.getMessage());
        }
        return false;
    }

    public Path getLocalFallbackDir() {
        return localFallbackDir;
    }
}
