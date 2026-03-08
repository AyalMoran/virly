
template <typename T>
class ScopeLock 
{
	public:
		explicit ScopeLock(T&);
		~ScopeLock();
	private:
		T& m_lock;
#if __cplusplus >= 201103L
		ScopeLock<T>& operator=(const ScopeLock<T>& other) = delete;
		ScopeLock(const ScopeLock& other) = delete;
#else
		ScopeLock<T>& operator=(const ScopeLock<T>& other);
		ScopeLock(const ScopeLock& other);
#endif
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
