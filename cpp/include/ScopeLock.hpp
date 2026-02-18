
template <typename T>
class ScopeLock 
{
	public:
		explicit ScopeLock(T&);
		~ScopeLock();
	private:
		T& m_lock;
		ScopeLock<T>& operator=(const ScopeLock<T>& other) = delete;
		ScopeLock(const ScopeLock& other) = delete;
};


template <typename T>
ScopeLock<T>::ScopeLock(T& to_lock) : m_lock(to_lock)
{
    m_lock.lock();
}

template <typename T> ScopeLock<T>::~ScopeLock()
{
    m_lock.unlock();
}

