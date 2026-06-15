#pragma once
#include <vector>
#include <mutex>
#include <condition_variable>
#include <queue>
#include <memory>

struct SftpBlock {
    std::vector<char> data;
    bool is_eof = false;
};

class SftpPipeline {
private:
    std::queue<std::shared_ptr<SftpBlock>> m_queue;
    std::mutex m_mutex;
    std::condition_variable m_cv_push;
    std::condition_variable m_cv_pop;
    size_t m_max_capacity;
    bool m_cancelled;

public:
    SftpPipeline(size_t max_capacity = 8) 
        : m_max_capacity(max_capacity), m_cancelled(false) {}

    bool Push(std::shared_ptr<SftpBlock> block) {
        std::unique_lock<std::mutex> lock(m_mutex);
        m_cv_push.wait(lock, [this]() { 
            return m_queue.size() < m_max_capacity || m_cancelled; 
        });
        if (m_cancelled) return false;
        m_queue.push(block);
        m_cv_pop.notify_one();
        return true;
    }

    std::shared_ptr<SftpBlock> Pop() {
        std::unique_lock<std::mutex> lock(m_mutex);
        m_cv_pop.wait(lock, [this]() { 
            return !m_queue.empty() || m_cancelled; 
        });
        if (m_cancelled) return nullptr;
        if (m_queue.empty()) return nullptr;
        auto block = m_queue.front();
        m_queue.pop();
        m_cv_push.notify_one();
        return block;
    }

    void Cancel() {
        std::lock_guard<std::mutex> lock(m_mutex);
        m_cancelled = true;
        m_cv_push.notify_all();
        m_cv_pop.notify_all();
    }
    
    void Reset() {
        std::lock_guard<std::mutex> lock(m_mutex);
        m_cancelled = false;
        while (!m_queue.empty()) m_queue.pop();
    }
};
