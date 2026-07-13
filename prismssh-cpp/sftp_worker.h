#pragma once
#ifndef SFTP_WORKER_H
#define SFTP_WORKER_H

#include <string>
#include <memory>
#include "ssh_session.h"

// Async SFTP download and upload threads
void AsyncDownloadFileThread(std::string reqId, std::shared_ptr<SSHSession> session, std::string remotePath, std::wstring localPath);
void AsyncUploadFileThread(std::string reqId, std::shared_ptr<SSHSession> session, std::wstring localPath, std::string remotePath);

// Progress-based SFTP thread workers
void UploadThread(std::shared_ptr<SSHSession> session, std::string fileData, std::string remotePath, std::string uploadId);
void UploadFromPathThread(std::shared_ptr<SSHSession> session, std::wstring localPath, std::string remotePath, std::string uploadId);
void DownloadThread(std::shared_ptr<SSHSession> session, std::string remotePath, std::string downloadId);
void DownloadToPathThread(std::shared_ptr<SSHSession> session, std::string remotePath, std::wstring localPath, std::string downloadId);

// Temporary edited file sync map cleanup
void CleanupEditMappings();

#endif // SFTP_WORKER_H
