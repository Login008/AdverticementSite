Все настройки БД в файле database.js в пункте options

Код для создания БД:

CREATE TABLE Users (
    UserID INT PRIMARY KEY IDENTITY,
    Username NVARCHAR(50) UNIQUE,
    PasswordHash NVARCHAR(255),
    Email NVARCHAR(100),
    CreatedAt DATETIME DEFAULT GETDATE()
);

CREATE TABLE Categories (
    CategoryID INT PRIMARY KEY IDENTITY,
    Name NVARCHAR(50) UNIQUE
);

CREATE TABLE Ads (
    AdID INT PRIMARY KEY IDENTITY,
    Title NVARCHAR(255),
    Description NVARCHAR(MAX),
    Price DECIMAL(10,2),
    ImagePath NVARCHAR(255),
    UserID INT FOREIGN KEY REFERENCES Users(UserID),
    CreatedAt DATETIME DEFAULT GETDATE()
);

CREATE TABLE AdCategories (
    AdID INT FOREIGN KEY REFERENCES Ads(AdID),
    CategoryID INT FOREIGN KEY REFERENCES Categories(CategoryID),
    PRIMARY KEY (AdID, CategoryID)
);

CREATE TABLE Reviews (
    ReviewID INT PRIMARY KEY IDENTITY,
    ReviewerUserID INT FOREIGN KEY REFERENCES Users(UserID),
    TargetType NVARCHAR(20) CHECK (TargetType IN ('ad', 'user')),
    TargetID INT,
    Rating INT CHECK (Rating BETWEEN 1 AND 5),
    Comment NVARCHAR(MAX),
    CreatedAt DATETIME DEFAULT GETDATE()
);