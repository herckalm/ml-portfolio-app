using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace MlPortfolio.Api.Migrations
{
    /// <inheritdoc />
    public partial class AddProjectModelId : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "ModelId",
                table: "Projects",
                type: "character varying(100)",
                maxLength: 100,
                nullable: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "ModelId",
                table: "Projects");
        }
    }
}
