using MlPortfolio.Api.Domain.Entities;

namespace MlPortfolio.Api.Repositories;

public interface IUserRepository
{
    Task<bool> ExistsByEmailAsync(string email);
    Task<User?> GetByEmailAsync(string email);
    Task<User> CreateAsync(User user);
    Task<User?> GetByHandleAsync(string handle);
    Task<bool> ExistsByHandleAsync(string handle);
    Task<User?> GetByIdAsync(int id);
    Task<User> UpdateAsync(User user);
}